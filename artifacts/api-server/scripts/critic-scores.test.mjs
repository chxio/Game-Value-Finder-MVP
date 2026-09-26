import assert from "node:assert/strict";
import { after, test } from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import ExcelJS from "exceljs";
import { getSteamDetails, normalizedDeal } from "./refresh-game-deals.mjs";

const scriptsDir = path.dirname(fileURLToPath(import.meta.url));
const buildDir = await mkdtemp(path.join(scriptsDir, ".critic-test-"));
after(() => rm(buildDir, { recursive: true, force: true }));
await build({
  entryPoints: {
    steam: path.join(scriptsDir, "../src/lib/steam.ts"),
    workbook: path.join(scriptsDir, "../src/lib/workbook-catalog.ts"),
  },
  outdir: buildDir,
  outExtension: { ".js": ".mjs" },
  bundle: true,
  packages: "external",
  platform: "node",
  format: "esm",
  logLevel: "silent",
});
const { getCatalog, metacriticRating } = await import(path.join(buildDir, "steam.mjs"));
const { parseGame } = await import(path.join(buildDir, "workbook.mjs"));

const criticUrl = "https://www.metacritic.com/game/example/";
const details = (id, score = 87, url = criticUrl) => ({
  steam_appid: id, type: "game", name: `Game ${id}`, required_age: 0,
  genres: [{ description: "Action" }], metacritic: { score, url },
});
const deal = {
  steamAppID: "110", salePrice: "10", normalPrice: "20",
  steamRatingPercent: "80", steamRatingCount: "200",
  dealID: "verified", storeID: "1", title: "Game 110",
};

test("critic score requires both a valid integer and an approved HTTPS game link", () => {
  assert.deepEqual(metacriticRating(details(110)), {
    source: "Metacritic", audience: "critics", originalScore: 87,
    originalScale: 100, ratingOutOfFive: 4.35, url: criticUrl,
  });
  assert.equal(metacriticRating({ type: "game" }), null);
  for (const score of [null, 0, 101, 87.5, "87"]) {
    assert.equal(metacriticRating(details(110, score)), null, `score ${score}`);
  }
  for (const url of [null, "", "not a URL", "http://www.metacritic.com/game/example",
    "https://www.metacritic.com.evil.test/game/example",
    "https://www.metacritic.com/movie/example"]) {
    assert.equal(metacriticRating(details(110, 87, url)), null, `link ${url}`);
  }
});

test("refresh only records critic data for matching Steam details and keeps value score Steam-based", async () => {
  const oldFetch = globalThis.fetch;
  globalThis.fetch = async () => ({
    ok: true, json: async () => ({
      unrelatedKey: { success: true, data: details(999, 100) },
    }),
  });
  try {
    assert.equal(await getSteamDetails(110), undefined);
  } finally {
    globalThis.fetch = oldFetch;
  }
  assert.equal(normalizedDeal(deal, details(999, 100), "2026-01-01"), null);
  const withCritic = normalizedDeal(deal, details(110, 100), "2026-01-01");
  const withoutCritic = normalizedDeal(deal, { ...details(110), metacritic: undefined }, "2026-01-01");
  assert.equal(withCritic.criticScore, 100);
  assert.equal(withCritic.criticUrl, criticUrl);
  assert.equal(withoutCritic.criticScore, "");
  assert.equal(withoutCritic.criticUrl, "");
  assert.equal(withCritic.score, withoutCritic.score);
  for (const invalid of [details(110, 0), details(110, 88, "https://evil.test/game/example")]) {
    const row = normalizedDeal(deal, invalid, "2026-01-01");
    assert.equal(row.criticScore, "");
    assert.equal(row.criticUrl, "");
  }
});

const baseRow = {
  "Steam App ID": 110, "Game / deal": "Game 110", Genres: "Action",
  "Sale price (USD)": 10, "Normal price (USD)": 20, "Discount %": 50,
  "Steam rating (/5)": 4, "Steam review count": 200,
  "Deal link": "https://www.cheapshark.com/redirect?dealID=verified",
  "Review link": "https://steamcommunity.com/app/110/reviews/",
  "Verified SFW": "Yes",
};
function workbookGame(fields) {
  const sheet = new ExcelJS.Workbook().addWorksheet("Deals");
  const columns = new Map(Object.keys(fields).map((name, index) => [name, index + 1]));
  sheet.addRow(Object.values(fields));
  return parseGame(sheet.getRow(1), columns);
}

test("legacy workbooks without critic columns still load the Steam rating and rank", () => {
  const old = workbookGame(baseRow);
  assert.equal(old.ratings.length, 1);
  assert.equal(old.ratings[0].source, "Steam player reviews");
  assert.equal(old.dopeScore, 20);
  assert.equal(old.scoreBasis, "Steam player reviews");

  const withCritic = workbookGame({
    ...baseRow, "Metacritic critic score (/100)": 87,
    "Metacritic link": criticUrl,
  });
  assert.deepEqual(withCritic.ratings[1], {
    source: "Metacritic", audience: "critics", originalScore: 87,
    originalScale: 100, ratingOutOfFive: 4.35, url: criticUrl,
  });
  assert.equal(withCritic.dopeScore, old.dopeScore);
});

test("workbook omits incomplete or invalid critic rows without rejecting the game", () => {
  for (const critic of [
    { "Metacritic critic score (/100)": 80 },
    { "Metacritic link": criticUrl },
    { "Metacritic critic score (/100)": 0, "Metacritic link": criticUrl },
    { "Metacritic critic score (/100)": 101, "Metacritic link": criticUrl },
    { "Metacritic critic score (/100)": 80.5, "Metacritic link": criticUrl },
    { "Metacritic critic score (/100)": 80, "Metacritic link": "https://evil.test/game/example" },
  ]) {
    const game = workbookGame({ ...baseRow, ...critic });
    assert.equal(game.ratings.length, 1);
    assert.equal(game.dopeScore, 20);
  }
  assert.equal(workbookGame({
    ...baseRow, "Metacritic critic score (/100)": 80,
    "Metacritic link": "https://metacritic.com/game/example",
  }).ratings[1].ratingOutOfFive, 4);
});

test("live catalog rejects wrong Steam identity and ranks by player reviews, not critic score", async () => {
  const oldFetch = globalThis.fetch;
  const items = [110, 111, 112].map((id) => ({
    id, name: `Game ${id}`, discount_percent: 50, final_price: 1000,
    original_price: 2000, currency: "USD",
  }));
  globalThis.fetch = async (input) => {
    const url = new URL(input);
    let json;
    if (url.pathname.endsWith("/featuredcategories/")) json = { specials: { items } };
    else if (url.pathname.endsWith("/appdetails")) {
      const id = Number(url.searchParams.get("appids"));
      json = id === 110 ? { wrongKey: { success: true, data: details(110, 1) } }
        : id === 111 ? { "111": { success: true, data: details(999, 100) } }
        : id === 112 ? { "112": { success: true, data: { ...details(112), metacritic: undefined } } }
        : {};
    } else if (url.pathname.includes("/appreviews/")) {
      const id = Number(url.pathname.split("/")[2]);
      json = { success: 1, query_summary: {
        total_positive: id === 110 ? 90 : 60, total_negative: id === 110 ? 10 : 40,
      } };
    } else throw new Error(`Unexpected URL: ${url}`);
    return { ok: true, json: async () => json };
  };
  try {
    const catalog = await getCatalog("PC", "US");
    assert.deepEqual(catalog.games.map((game) => game.id), ["110", "112"]);
    assert.equal(catalog.games[0].ratings[1].originalScore, 1);
    assert.equal(catalog.games[0].ratings[1].ratingOutOfFive, 0.05);
    assert.equal(catalog.games[1].ratings.length, 1);
    assert.equal(catalog.games[0].scoreBasis, "Steam player reviews");
    assert.ok(catalog.games[0].dopeScore > catalog.games[1].dopeScore);
  } finally {
    globalThis.fetch = oldFetch;
  }
});