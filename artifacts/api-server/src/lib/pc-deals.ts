import { metacriticRating, type Catalog, type CatalogGame } from "./steam";

const PAGE_SIZE = 20;
const ADULT_TERMS = /\b(hentai|porn|xxx|erotic|sexual|nudity|fetish|orgy|adult only|18\+)\b/i;
const ADULT_DESCRIPTOR_IDS = new Set([3, 4, 5, 6]);

type Deal = {
  steamAppID?: string;
  storeID?: string;
  dealID?: string;
  title?: string;
  salePrice?: string;
  normalPrice?: string;
  steamRatingPercent?: string;
  steamRatingCount?: string;
  thumb?: string;
};

type SteamDetails = {
  steam_appid?: number;
  type?: string;
  name?: string;
  required_age?: number | string;
  genres?: { description: string }[];
  categories?: { description: string }[];
  content_descriptors?: { ids?: number[]; notes?: string };
  metacritic?: { score?: number; url?: string };
  header_image?: string;
};

async function readJson<T>(url: string): Promise<T> {
  const response = await fetch(url, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error(`Steam returned ${response.status}`);
  return await response.json() as T;
}

function toGame(deal: Deal, details: SteamDetails | undefined): CatalogGame | null {
  const id = Number(deal.steamAppID);
  const currentPrice = Number(deal.salePrice);
  const originalPrice = Number(deal.normalPrice);
  const percent = Number(deal.steamRatingPercent);
  const count = Number(deal.steamRatingCount);
  const age = Number(details?.required_age);
  if (
    !Number.isSafeInteger(id) || id <= 0 ||
    !deal.title || !deal.dealID || !/^[A-Za-z0-9%+/_=-]+$/.test(deal.dealID) ||
    deal.storeID !== "1" || details?.steam_appid !== id || details.type !== "game" ||
    details.required_age == null || details.required_age === "" ||
    !Number.isFinite(age) || age >= 18 || age < 0 ||
    !details.content_descriptors || !Array.isArray(details.content_descriptors.ids) ||
    !Number.isFinite(currentPrice) || currentPrice <= 0 ||
    !Number.isFinite(originalPrice) || originalPrice <= currentPrice ||
    !Number.isFinite(percent) || percent < 0 || percent > 100 ||
    !Number.isInteger(count) || count < 100
  ) return null;

  const genre = (details.genres ?? []).map((item) => item.description).filter(Boolean).slice(0, 4);
  if (!genre.length || (details.content_descriptors?.ids ?? []).some((id) => ADULT_DESCRIPTOR_IDS.has(id)) ||
    ADULT_TERMS.test([
      deal.title, details.name, details.content_descriptors?.notes,
      ...genre, ...(details.categories ?? []).map((item) => item.description),
    ].join(" "))) return null;

  const discountPercent = Math.round((1 - currentPrice / originalPrice) * 100);
  const ratingOutOfFive = Math.round(percent * 5) / 100;
  const reviewUrl = `https://steamcommunity.com/app/${id}/reviews/`;
  return {
    id: String(id),
    name: deal.title,
    platform: "PC",
    provider: "Steam via CheapShark",
    genre,
    imageUrl: details.header_image || deal.thumb || "",
    storeUrl: `https://www.cheapshark.com/redirect?dealID=${deal.dealID}`,
    reviewUrl,
    currency: "USD",
    currentPrice,
    originalPrice,
    discountPercent,
    ratingOutOfFive,
    reviewCount: count,
    dopeScore: Math.round((discountPercent * ratingOutOfFive / currentPrice) * 100) / 100,
    scoreBasis: "Steam player reviews",
    ratings: [
      { source: "Steam player reviews", audience: "players", originalScore: percent,
        originalScale: 100, ratingOutOfFive, url: reviewUrl },
      ...[metacriticRating(details)].filter((rating): rating is NonNullable<typeof rating> => rating !== null),
    ],
  };
}

export async function browsePcDeals(page: number): Promise<Catalog & { page: number; hasMore: boolean }> {
  const params = new URLSearchParams({
    storeID: "1", onSale: "1", pageSize: String(PAGE_SIZE), pageNumber: String(page),
    sortBy: "DealRating", minimumReviewCount: "100",
  });
  const response = await fetch(`https://www.cheapshark.com/api/1.0/deals?${params}`, {
    headers: { Accept: "application/json", "User-Agent": "GameValueFinder/1.0 (on-demand deal browser)" },
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error(`CheapShark returned ${response.status}`);
  const deals = await response.json() as Deal[];
  if (!Array.isArray(deals)) throw new Error("CheapShark response was not a deal list");
  const totalPages = Number(response.headers.get("X-Total-Page-Count"));
  const capturedAt = new Date().toISOString();
  const games: CatalogGame[] = [];
  // Fetch only this requested page. Do not prefetch or persist a bulk catalog.
  for (let offset = 0; offset < deals.length; offset += 2) {
    const batch = await Promise.all(deals.slice(offset, offset + 2).map(async (deal) => {
      const id = Number(deal.steamAppID);
      if (!Number.isSafeInteger(id) || id <= 0 || Number(deal.steamRatingCount) < 100) return null;
      const result = await readJson<Record<string, { success?: boolean; data?: SteamDetails }>>(
        `https://store.steampowered.com/api/appdetails?appids=${id}&cc=US&l=en`,
      );
      const details = Object.values(result).find((entry) => entry.success && entry.data?.steam_appid === id)?.data;
      return toGame(deal, details);
    }));
    games.push(...batch.filter((game): game is CatalogGame => game !== null));
    if (offset + 2 < deals.length) await new Promise((resolve) => setTimeout(resolve, 250));
  }
  const unique = [...new Map(games.map((game) => [game.id, game])).values()]
    .sort((a, b) => b.dopeScore - a.dopeScore);
  return {
    platform: "PC", region: "US", currency: "USD", games: unique, page,
    hasMore: deals.length === PAGE_SIZE && page < 50 &&
      (!Number.isInteger(totalPages) || totalPages <= 0 || page < totalPages),
    refreshedAt: capturedAt,
    sources: [
      { name: "CheapShark requested page", url: "https://apidocs.cheapshark.com/", status: "snapshot",
        detail: `Page ${page + 1} fetched on request at ${capturedAt}; USD sale prices may change after capture.` },
      { name: "Steam game details", url: "https://store.steampowered.com/",
        status: "snapshot", detail: "Each offer checked against matching Steam app ID, age, content and genres at capture." },
      { name: "Steam player ratings", url: "https://steamcommunity.com/",
        status: "snapshot", detail: "CheapShark's Steam positive-review percentage and count at capture." },
      { name: "Metacritic critic scores via Steam", url: "https://store.steampowered.com/api/appdetails",
        status: "snapshot", detail: "Optional Steam-supplied critic score; not part of value ranking." },
    ],
    message: `On-demand page ${page + 1} captured ${capturedAt}. Prices are not live; check checkout before buying. Links redirect through CheapShark to Steam.`,
  };
}