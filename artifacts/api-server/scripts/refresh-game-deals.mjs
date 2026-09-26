import ExcelJS from "exceljs";
import { mkdir, rename } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { findRawgRating, rawgEnabled } from "../src/lib/rawg.mjs";

const SOURCE_URL =
  "https://www.cheapshark.com/api/1.0/deals?storeID=1&onSale=1&pageSize=60&sortBy=DealRating&minimumReviewCount=100";
const USER_AGENT = "GameValueFinder/1.0 (single-page deal snapshot)";
const ADULT_TERMS = /\b(hentai|porn|xxx|erotic|sexual|nudity|fetish|orgy|adult only|18\+)\b/i;
const ADULT_DESCRIPTOR_IDS = new Set([3, 4, 5, 6]);
const workbookPath = fileURLToPath(new URL("../data/game-deals.xlsx", import.meta.url));

async function getJson(url) {
  const response = await fetch(url, {
    headers: { Accept: "application/json", "User-Agent": USER_AGENT },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) {
    throw new Error(
      `Data source returned ${response.status}${response.headers.get("retry-after") ? ` (retry after ${response.headers.get("retry-after")}s)` : ""}`,
    );
  }
  return response.json();
}

async function getSteamDetails(appId) {
  const result = await getJson(
    `https://store.steampowered.com/api/appdetails?appids=${appId}&cc=US&l=en`,
  );
  return Object.values(result).find(
    (entry) => entry?.success && entry.data?.steam_appid === appId,
  )?.data;
}

function isSafe(details, title) {
  if (!details || details.type !== "game") return false;
  const age = Number(details.required_age ?? 0);
  if (!Number.isFinite(age) || age >= 18) return false;
  const descriptors = details.content_descriptors;
  if ((descriptors?.ids ?? []).some((id) => ADULT_DESCRIPTOR_IDS.has(id))) return false;
  const text = [
    title,
    details.name,
    descriptors?.notes,
    ...(details.genres ?? []).map((genre) => genre.description),
    ...(details.categories ?? []).map((category) => category.description),
  ].join(" ");
  return !ADULT_TERMS.test(text);
}

function normalizedDeal(deal, details, verifiedAt) {
  const appId = Number(deal.steamAppID);
  const price = Number(deal.salePrice);
  const normal = Number(deal.normalPrice);
  const ratingPercent = Number(deal.steamRatingPercent);
  const reviewCount = Number(deal.steamRatingCount);
  if (
    !Number.isInteger(appId) ||
    !Number.isFinite(price) || price <= 0 ||
    !Number.isFinite(normal) || normal <= price ||
    !Number.isFinite(ratingPercent) || ratingPercent < 0 || ratingPercent > 100 ||
    !Number.isInteger(reviewCount) || reviewCount < 100 ||
    !deal.dealID || deal.storeID !== "1" ||
    !isSafe(details, deal.title)
  ) return null;

  const genres = (details.genres ?? []).map((genre) => genre.description).slice(0, 4);
  if (!genres.length) return null;
  const discountPercent = Math.round((1 - price / normal) * 100);
  const rating = Math.round(ratingPercent * 5) / 100;
  let criticScore = "";
  let criticUrl = "";
  if (Number.isInteger(details.metacritic?.score) && details.metacritic.score >= 1 &&
    details.metacritic.score <= 100 && typeof details.metacritic.url === "string") {
    try {
      const url = new URL(details.metacritic.url);
      if (url.protocol === "https:" && ["metacritic.com", "www.metacritic.com"].includes(url.hostname) &&
        url.pathname.startsWith("/game/")) {
        criticScore = details.metacritic.score;
        criticUrl = url.href;
      }
    } catch { /* Invalid source link: omit the optional score. */ }
  }
  return {
    appId,
    title: deal.title,
    genres: genres.join(" | "),
    price,
    normal,
    discountPercent,
    rating,
    reviewCount,
    criticScore,
    criticUrl,
    score: Math.round(((discountPercent * rating) / price) * 100) / 100,
    dealUrl: `https://www.cheapshark.com/redirect?dealID=${deal.dealID}`,
    storeUrl: `https://store.steampowered.com/app/${appId}`,
    reviewUrl: `https://steamcommunity.com/app/${appId}/reviews/`,
    imageUrl: details.header_image || deal.thumb || "",
    verifiedAt,
  };
}

const rawDeals = await getJson(SOURCE_URL);
if (!Array.isArray(rawDeals)) throw new Error("Deals API did not return a list.");

const verifiedAt = new Date().toISOString();
const eligible = rawDeals.filter(
  (deal) => /^\d+$/.test(String(deal.steamAppID ?? "")) && Number(deal.steamRatingCount) >= 100,
);
const rows = [];

for (let i = 0; i < eligible.length; i += 4) {
  const batch = await Promise.all(
    eligible.slice(i, i + 4).map(async (deal) => {
      try {
        const details = await getSteamDetails(Number(deal.steamAppID));
        return normalizedDeal(deal, details, verifiedAt);
      } catch (error) {
        console.warn(`Skipping ${deal.title}: ${error instanceof Error ? error.message : String(error)}`);
        return null;
      }
    }),
  );
  rows.push(...batch.filter(Boolean));
  await new Promise((resolve) => setTimeout(resolve, 250));
}

const unique = [...new Map(rows.map((row) => [row.appId, row])).values()]
  .sort((a, b) => b.score - a.score);
if (unique.length < 10) {
  throw new Error(`Only ${unique.length} verified, safe deals were found; existing workbook was not changed.`);
}
if (rawgEnabled()) {
  for (let i = 0; i < unique.length; i += 3) {
    await Promise.all(unique.slice(i, i + 3).map(async (deal) => {
      try {
        const rating = await findRawgRating(deal.appId, deal.title);
        deal.rawgRating = rating?.originalScore ?? "";
        deal.rawgUrl = rating?.url ?? "";
      } catch (error) {
        console.warn(`RAWG rating unavailable for ${deal.title}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }));
  }
}

const workbook = new ExcelJS.Workbook();
workbook.creator = "Game Value Finder";
workbook.created = new Date();
const sheet = workbook.addWorksheet("Deals", {
  views: [{ state: "frozen", ySplit: 1 }],
});
sheet.columns = [
  { header: "Steam App ID", key: "appId", width: 15 },
  { header: "Game / deal", key: "title", width: 42 },
  { header: "Genres", key: "genres", width: 32 },
  { header: "Sale price (USD)", key: "price", width: 19 },
  { header: "Normal price (USD)", key: "normal", width: 20 },
  { header: "Discount %", key: "discountPercent", width: 15 },
  { header: "Steam rating (/5)", key: "rating", width: 20 },
  { header: "Steam review count", key: "reviewCount", width: 20 },
  { header: "Metacritic critic score (/100)", key: "criticScore", width: 28 },
  { header: "Metacritic link", key: "criticUrl", width: 54 },
  { header: "RAWG player rating (/5)", key: "rawgRating", width: 24 },
  { header: "RAWG game link", key: "rawgUrl", width: 54 },
  { header: "Dope score", key: "score", width: 16 },
  { header: "Deal link", key: "dealUrl", width: 48 },
  { header: "Steam store link", key: "storeUrl", width: 46 },
  { header: "Review link", key: "reviewUrl", width: 49 },
  { header: "Cover image", key: "imageUrl", width: 58 },
  { header: "Verified SFW", key: "sfw", width: 16 },
  { header: "Price source", key: "source", width: 18 },
  { header: "Snapshot time (UTC)", key: "verifiedAt", width: 27 },
];
sheet.autoFilter = { from: "A1", to: `T${unique.length + 1}` };
sheet.getRow(1).height = 28;
sheet.getRow(1).eachCell((cell) => {
  cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF202A40" } };
  cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
  cell.alignment = { vertical: "middle" };
});

unique.forEach((deal, index) => {
  const rowNumber = index + 2;
  const row = sheet.addRow({
    ...deal,
    sfw: "Yes",
    source: "CheapShark / Steam",
  });
  row.getCell("score").value = {
    formula: `IFERROR(F${rowNumber}*G${rowNumber}/D${rowNumber},0)`,
    result: deal.score,
  };
  for (const key of ["dealUrl", "storeUrl", "reviewUrl", "criticUrl", "rawgUrl"]) {
    const url = deal[key];
    if (!url) continue;
    row.getCell(key).value = { text: url, hyperlink: url };
    row.getCell(key).font = { color: { argb: "FF3975A7" }, underline: true };
  }
  for (const key of ["price", "normal"]) row.getCell(key).numFmt = '"$"#,##0.00';
  for (const key of ["rating", "score"]) row.getCell(key).numFmt = "0.00";
  if (index % 2 === 1) {
    row.eachCell((cell) => {
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF3F6FA" } };
    });
  }
});

const about = workbook.addWorksheet("About");
about.columns = [{ width: 28 }, { width: 110 }];
const notes = [
  ["Dataset", "Game Value Finder — PC deals snapshot"],
  ["Captured at (UTC)", verifiedAt],
  ["Rows", unique.length],
  ["Price source", "CheapShark public deals API, one page of Steam-store deals, USD"],
  ["Source page", "https://apidocs.cheapshark.com/"],
  ["Store metadata", "Steam public app details endpoint; age and content descriptors screened"],
  ["Review rating", "CheapShark's Steam positive-review percentage, converted to a 5-point scale"],
  ["Optional critic rating", "Metacritic PC critic score and link supplied by Steam game details; 0–100 divided by 20 for display only, not included in the Dope score."],
  ["Optional community rating", "RAWG player rating (0–5) is included only with approved API access and an exact Steam app-ID match from RAWG's store links. Not used in the Dope score."],
  ["Dope score", "(Discount percentage points × Steam rating out of 5) ÷ sale price in USD"],
  ["Important", "This is a dated snapshot, not a live price feed. Verify the current deal before buying."],
  ["Link policy", "Deal links go through CheapShark's redirect page as required by its API documentation."],
  ["Coverage", "One bounded browse page, not the full Steam store. Only verified, non-explicit, under-18 titles with 100+ reviews."],
  ["Refresh", "Run pnpm --filter @workspace/api-server run refresh:games manually to replace this workbook."],
];
for (const item of notes) about.addRow(item);
about.getColumn(1).font = { bold: true, color: { argb: "FF202A40" } };
about.getColumn(2).alignment = { wrapText: true, vertical: "top" };
about.getRow(9).height = 32;
about.getRow(11).height = 32;

await mkdir(path.dirname(workbookPath), { recursive: true });
const temporaryPath = `${workbookPath}.tmp`;
await workbook.xlsx.writeFile(temporaryPath);
await rename(temporaryPath, workbookPath);
console.log(`Saved ${unique.length} verified games from one CheapShark browse page to ${workbookPath}`);