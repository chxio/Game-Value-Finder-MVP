import ExcelJS from "exceljs";
import { stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { logger } from "./logger";
import type { Catalog, CatalogGame } from "./steam";

const workbookPath = fileURLToPath(new URL("../data/game-deals.xlsx", import.meta.url));
const sourceUrl = "https://www.cheapshark.com/";
const ADULT_TERMS = /\b(hentai|porn|xxx|erotic|sexual|nudity|fetish|orgy|adult only|18\+)\b/i;
let cached: { mtimeMs: number; size: number; catalog: Catalog } | null = null;

function textCell(row: ExcelJS.Row, columns: Map<string, number>, name: string): string {
  const index = columns.get(name);
  if (!index) return "";
  const value: unknown = row.getCell(index).value;
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (value && typeof value === "object" && "text" in value) {
    return String(value.text ?? "");
  }
  return "";
}

function isApprovedLink(value: string, hostname: string, pathnamePrefix: string): boolean {
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      url.hostname === hostname &&
      url.pathname.startsWith(pathnamePrefix)
    );
  } catch {
    return false;
  }
}

function parseGame(row: ExcelJS.Row, columns: Map<string, number>): CatalogGame | null {
  const field = (name: string) => textCell(row, columns, name);
  const id = field("Steam App ID");
  const name = field("Game / deal").trim();
  const genre = field("Genres").split("|").map((part) => part.trim()).filter(Boolean);
  const currentPrice = Number(field("Sale price (USD)"));
  const originalPrice = Number(field("Normal price (USD)"));
  const discountPercent = Number(field("Discount %"));
  const ratingOutOfFive = Number(field("Steam rating (/5)"));
  const reviewCount = Number(field("Steam review count"));
  const storeUrl = field("Deal link");
  const reviewUrl = field("Review link");
  const imageUrl = field("Cover image");

  if (
    !/^\d+$/.test(id) ||
    !name || ADULT_TERMS.test(name) ||
    field("Verified SFW") !== "Yes" ||
    !genre.length ||
    !Number.isFinite(currentPrice) || currentPrice <= 0 ||
    !Number.isFinite(originalPrice) || originalPrice <= currentPrice ||
    !Number.isFinite(discountPercent) || discountPercent <= 0 || discountPercent > 100 ||
    Math.abs(discountPercent - Math.round((1 - currentPrice / originalPrice) * 100)) > 1 ||
    !Number.isFinite(ratingOutOfFive) || ratingOutOfFive < 0 || ratingOutOfFive > 5 ||
    !Number.isInteger(reviewCount) || reviewCount < 100 ||
    !isApprovedLink(storeUrl, "www.cheapshark.com", "/redirect") ||
    !isApprovedLink(reviewUrl, "steamcommunity.com", `/app/${id}/reviews/`)
  ) return null;

  const dopeScore = Math.round(
    ((discountPercent * ratingOutOfFive) / currentPrice) * 100,
  ) / 100;

  return {
    id,
    name,
    platform: "PC",
    provider: "Steam via CheapShark",
    genre,
    imageUrl,
    storeUrl,
    reviewUrl,
    currency: "USD",
    currentPrice,
    originalPrice,
    discountPercent,
    ratingOutOfFive,
    reviewCount,
    dopeScore,
  };
}

function unavailable(message: string): Catalog {
  return {
    platform: "PC",
    region: "US",
    currency: "USD",
    games: [],
    sources: [{
      name: "Game deals workbook",
      url: sourceUrl,
      status: "unavailable",
      detail: message,
    }],
    refreshedAt: null,
    message,
  };
}

async function readCatalog(): Promise<Catalog> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(workbookPath);
  const sheet = workbook.getWorksheet("Deals");
  const about = workbook.getWorksheet("About");
  if (!sheet || !about) throw new Error("The workbook needs Deals and About sheets.");

  const timestamp = String(about.getCell("B2").value ?? "");
  if (Number.isNaN(Date.parse(timestamp))) throw new Error("Snapshot timestamp is invalid.");
  const columns = new Map<string, number>();
  sheet.getRow(1).eachCell((cell, index) => {
    columns.set(String(cell.value), index);
  });

  const games: CatalogGame[] = [];
  sheet.eachRow((row, index) => {
    if (index === 1) return;
    const game = parseGame(row, columns);
    if (game) games.push(game);
  });
  if (!games.length) throw new Error("The workbook has no verified safe games.");
  games.sort((a, b) => b.dopeScore - a.dopeScore);

  return {
    platform: "PC",
    region: "US",
    currency: "USD",
    games,
    sources: [
      {
        name: "CheapShark deal snapshot",
        url: "https://apidocs.cheapshark.com/",
        status: "snapshot",
        detail: "One bounded page of Steam-store deals; prices are in USD and may have changed since the snapshot.",
      },
      {
        name: "Steam game details",
        url: "https://store.steampowered.com/",
        status: "snapshot",
        detail: "Genres and age/content checks were verified against Steam when the workbook was created.",
      },
      {
        name: "Steam player ratings",
        url: "https://steamcommunity.com/",
        status: "snapshot",
        detail: "Steam positive-review percentages supplied by CheapShark and converted to a 5-point rating.",
      },
    ],
    refreshedAt: new Date(timestamp).toISOString(),
    message:
      `Workbook snapshot from ${new Date(timestamp).toLocaleString("en-US", { timeZone: "UTC" })} UTC. Prices are not live; verify the deal before buying. Deal links redirect through CheapShark to Steam.`,
  };
}

export async function getWorkbookCatalog(): Promise<Catalog> {
  try {
    const file = await stat(workbookPath);
    if (cached?.mtimeMs === file.mtimeMs && cached.size === file.size) return cached.catalog;
    const catalog = await readCatalog();
    cached = { mtimeMs: file.mtimeMs, size: file.size, catalog };
    return catalog;
  } catch (error) {
    logger.warn({ error }, "Game deals workbook could not be read");
    return unavailable(
      "The verified game workbook is unavailable. Run the manual refresh to rebuild it.",
    );
  }
}