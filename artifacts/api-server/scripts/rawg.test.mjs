import assert from "node:assert/strict";
import { test } from "node:test";
import { findRawgRating } from "../src/lib/rawg.mjs";

test("RAWG is off without explicit permission and credentials", async () => {
  const original = process.env.RAWG_USAGE_APPROVED;
  process.env.RAWG_USAGE_APPROVED = "false";
  try {
    assert.equal(await findRawgRating(10, "Portal"), null);
  } finally {
    if (original === undefined) delete process.env.RAWG_USAGE_APPROVED;
    else process.env.RAWG_USAGE_APPROVED = original;
  }
});

test("only exact Steam app links can attach a RAWG player rating", async () => {
  const oldKey = process.env.RAWG_API_KEY;
  const oldApproval = process.env.RAWG_USAGE_APPROVED;
  const oldFetch = globalThis.fetch;
  process.env.RAWG_API_KEY = "fixture";
  process.env.RAWG_USAGE_APPROVED = "true";
  const requests = [];
  globalThis.fetch = async (input) => {
    const url = new URL(input);
    requests.push(url.pathname);
    const data = url.pathname.endsWith("/games")
      ? { results: [{ id: 1, slug: "wrong", rating: 5, ratings_count: 100 },
          { id: 2, slug: "portal", rating: 4.3, ratings_count: 25 }] }
      : { results: [{ url: url.pathname.endsWith("/1/stores")
        ? "https://store.steampowered.com/app/1000" : "https://store.steampowered.com/app/100" }] };
    return { ok: true, json: async () => data };
  };
  try {
    assert.deepEqual(await findRawgRating(100, "Portal"), {
      source: "RAWG community", audience: "players", originalScore: 4.3,
      originalScale: 5, ratingOutOfFive: 4.3, url: "https://rawg.io/games/portal",
    });
    assert.deepEqual(requests, ["/api/games", "/api/games/1/stores", "/api/games/2/stores"]);
  } finally {
    globalThis.fetch = oldFetch;
    if (oldKey === undefined) delete process.env.RAWG_API_KEY;
    else process.env.RAWG_API_KEY = oldKey;
    if (oldApproval === undefined) delete process.env.RAWG_USAGE_APPROVED;
    else process.env.RAWG_USAGE_APPROVED = oldApproval;
  }
});

test("unverified store links and insufficient votes are not displayed", async () => {
  const oldKey = process.env.RAWG_API_KEY;
  const oldApproval = process.env.RAWG_USAGE_APPROVED;
  const oldFetch = globalThis.fetch;
  process.env.RAWG_API_KEY = "fixture";
  process.env.RAWG_USAGE_APPROVED = "true";
  globalThis.fetch = async (input) => ({
    ok: true,
    json: async () => String(input).includes("/stores")
      ? { results: [{ url: "https://store.steampowered.com.evil.test/app/102" }] }
      : { results: [{ id: 3, slug: "other", rating: 4.8, ratings_count: 500 }] },
  });
  try {
    assert.equal(await findRawgRating(102, "Other"), null);
  } finally {
    globalThis.fetch = oldFetch;
    if (oldKey === undefined) delete process.env.RAWG_API_KEY;
    else process.env.RAWG_API_KEY = oldKey;
    if (oldApproval === undefined) delete process.env.RAWG_USAGE_APPROVED;
    else process.env.RAWG_USAGE_APPROVED = oldApproval;
  }
});