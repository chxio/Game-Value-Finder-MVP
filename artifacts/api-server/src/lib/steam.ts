import { logger } from "./logger";
import { getConsoleCatalog } from "./console-stores";
import { findRawgRating, rawgEnabled, rawgSource } from "./rawg.mjs";

type Platform = "PC" | "Xbox" | "PlayStation";

export type CatalogGame = {
  id: string;
  name: string;
  platform: Platform;
  provider: string;
  genre: string[];
  imageUrl: string;
  storeUrl: string;
  reviewUrl: string;
  currency: string;
  currentPrice: number;
  originalPrice: number;
  discountPercent: number;
  ratingOutOfFive: number;
  reviewCount: number;
  dopeScore: number;
  ratings?: { source: string; audience: "players" | "critics"; originalScore: number; originalScale: number; ratingOutOfFive: number; url: string }[];
  scoreBasis?: string;
};

type Source = {
  name: string;
  url: string;
  status: "live" | "snapshot" | "unavailable";
  detail: string;
};

export type Catalog = {
  platform: Platform;
  region: string;
  currency: string;
  games: CatalogGame[];
  sources: Source[];
  refreshedAt: string | null;
  message: string;
};

type SteamItem = {
  id: number;
  name: string;
  discount_percent: number;
  final_price: number;
  original_price: number;
  currency: string;
  header_image?: string;
  large_capsule_image?: string;
};

type SteamDetails = {
  success?: boolean;
  data?: {
    steam_appid?: number;
    type?: string;
    name?: string;
    header_image?: string;
    required_age?: string | number;
    price_overview?: {
      initial: number;
      final: number;
      discount_percent: number;
      currency: string;
    };
    genres?: { description: string }[];
    categories?: { description: string }[];
    content_descriptors?: { ids?: number[] };
    metacritic?: { score?: number; url?: string };
  };
};

type SteamReviews = {
  success?: number;
  query_summary?: {
    total_positive?: number;
    total_negative?: number;
    total_reviews?: number;
  };
};

const CACHE_MS = 15 * 60 * 1000;
const cache = new Map<string, { until: number; catalog: Catalog }>();
const inFlight = new Map<string, Promise<Catalog>>();

const STEAM_DEALS_URL = "https://store.steampowered.com/search/?specials=1";
const STEAM_REVIEWS_URL = "https://steamcommunity.com/";
const ADULT_TERMS = /\b(hentai|porn|xxx|erotic|sexual|nudity|fetish|orgy|adult only|18\+)\b/i;
const ADULT_DESCRIPTOR_IDS = new Set([3, 4, 5, 6]);

async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(12_000),
  });
  if (!response.ok) {
    throw new Error(`Steam returned ${response.status}`);
  }
  return (await response.json()) as T;
}

function isSafeGame(details: SteamDetails["data"], name: string): boolean {
  if (!details || details.type !== "game") return false;
  const age = Number(details.required_age ?? 0);
  if (!Number.isFinite(age) || age >= 18) return false;
  const labels = [
    name,
    ...(details.genres ?? []).map((genre) => genre.description),
    ...(details.categories ?? []).map((category) => category.description),
  ].join(" ");
  if (ADULT_TERMS.test(labels)) return false;
  return !(details.content_descriptors?.ids ?? []).some((id) =>
    ADULT_DESCRIPTOR_IDS.has(id),
  );
}

export function metacriticRating(details: SteamDetails["data"]) {
  const score = details?.metacritic?.score;
  const url = details?.metacritic?.url;
  if (!Number.isInteger(score) || score! < 1 || score! > 100 || !url) return null;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" || !["www.metacritic.com", "metacritic.com"].includes(parsed.hostname) ||
      !parsed.pathname.startsWith("/game/")) return null;
  } catch {
    return null;
  }
  return { source: "Metacritic", audience: "critics" as const, originalScore: score!, originalScale: 100,
    ratingOutOfFive: Math.round(score! * 5) / 100, url };
}

async function getSteamDetails(id: number, region: string): Promise<SteamDetails["data"]> {
  const response = await getJson<Record<string, SteamDetails>>(
    `https://store.steampowered.com/api/appdetails?appids=${id}&cc=${encodeURIComponent(region)}&l=en`,
  );
  // Steam occasionally keys this response with a different package/DLC ID.
  return Object.values(response).find(
    (entry) => entry.success && entry.data?.steam_appid === id,
  )?.data;
}

async function toGame(
  item: SteamItem,
  region: string,
  preloadedDetails?: SteamDetails["data"],
): Promise<CatalogGame | null> {
  if (
    !Number.isInteger(item.id) ||
    !item.name ||
    item.final_price <= 0 ||
    item.original_price <= 0 ||
    item.discount_percent <= 0
  ) return null;

  const [details, reviews] = await Promise.all([
    preloadedDetails ? Promise.resolve(preloadedDetails) : getSteamDetails(item.id, region),
    getJson<SteamReviews>(
      `https://store.steampowered.com/appreviews/${item.id}?json=1&language=all&purchase_type=all&num_per_page=0`,
    ),
  ]);
  if (!isSafeGame(details, item.name)) return null;

  const positive = reviews.query_summary?.total_positive ?? 0;
  const negative = reviews.query_summary?.total_negative ?? 0;
  const count = positive + negative;
  if (!reviews.success || count < 10) return null;

  const currentPrice = item.final_price / 100;
  const ratingOutOfFive = Math.round((positive / count) * 500) / 100;
  const dopeScore = Math.round(
    ((item.discount_percent * ratingOutOfFive) / currentPrice) * 100,
  ) / 100;

  return {
    id: String(item.id),
    name: item.name,
    platform: "PC",
    provider: "Steam",
    genre: (details?.genres ?? []).map((genre) => genre.description).slice(0, 4),
    imageUrl: item.large_capsule_image ?? item.header_image ?? "",
    storeUrl: `https://store.steampowered.com/app/${item.id}`,
    reviewUrl: `https://steamcommunity.com/app/${item.id}/reviews/`,
    currency: item.currency,
    currentPrice,
    originalPrice: item.original_price / 100,
    discountPercent: item.discount_percent,
    ratingOutOfFive,
    reviewCount: count,
    dopeScore,
    scoreBasis: "Steam player reviews",
    ratings: [
      { source: "Steam player reviews", audience: "players", originalScore: Math.round(positive / count * 10000) / 100,
        originalScale: 100, ratingOutOfFive, url: `https://steamcommunity.com/app/${item.id}/reviews/` },
      ...[metacriticRating(details)].filter((rating): rating is NonNullable<typeof rating> => rating !== null),
    ],
  };
}

async function loadSteamCatalog(region: string): Promise<Catalog> {
  const response = await getJson<{
    specials?: { items?: SteamItem[] };
    top_sellers?: { items?: SteamItem[] };
  }>(`https://store.steampowered.com/api/featuredcategories/?cc=${encodeURIComponent(region)}&l=en`);

  // Steam only exposes a limited featured set through this public endpoint.
  // Do not silently supplement it with unverified or scraped offers.
  // A small, hand-selected set of age-safe titles expands genre coverage.
  // Their prices are fetched live; the IDs do not stand in for offers.
  const curated = await Promise.all(
    [728880, 1426210].map(async (id) => {
      try {
        const details = await getSteamDetails(id, region);
        const price = details?.price_overview;
        if (!details?.name || !price || !isSafeGame(details, details.name)) return null;
        return {
          item: {
            id,
            name: details.name,
            discount_percent: price.discount_percent,
            final_price: price.final,
            original_price: price.initial,
            currency: price.currency,
            header_image: details.header_image,
          },
          details,
        };
      } catch (error) {
        logger.warn({ id, error }, "Steam curated game metadata unavailable");
        return null;
      }
    }),
  );
  const candidates = [
    ...(response.specials?.items ?? []).map((item) => ({ item, details: undefined })),
    ...(response.top_sellers?.items ?? []).map((item) => ({ item, details: undefined })),
    ...curated.filter((entry): entry is NonNullable<typeof entry> => entry !== null),
  ];
  const unique = [...new Map(candidates.map((entry) => [entry.item.id, entry])).values()]
    .filter(({ item }) => item.discount_percent > 0 && item.final_price > 0)
    .slice(0, 20);

  // Bound requests to be considerate of public endpoints.
  const games: CatalogGame[] = [];
  for (let index = 0; index < unique.length; index += 4) {
    const batch = await Promise.all(
      unique.slice(index, index + 4).map(async ({ item, details }) => {
        try {
          return await toGame(item, region, details);
        } catch (error) {
          logger.warn({ id: item.id, error }, "Steam game details or reviews unavailable");
          return null;
        }
      }),
    );
    games.push(...batch.filter((game): game is CatalogGame => game !== null));
  }
  games.sort((a, b) => b.dopeScore - a.dopeScore);
  if (rawgEnabled()) {
    for (let index = 0; index < games.length; index += 3) {
      await Promise.all(games.slice(index, index + 3).map(async (game) => {
        try {
          const rating = await findRawgRating(game.id, game.name);
          if (rating) game.ratings?.push(rating);
        } catch (error) {
          logger.warn({ id: game.id, error }, "RAWG community rating unavailable");
        }
      }));
    }
  }

  return {
    platform: "PC",
    region,
    currency: games[0]?.currency ?? (region === "IN" ? "INR" : "USD"),
    games,
    sources: [
      {
        name: "Steam Store",
        url: STEAM_DEALS_URL,
        status: "live",
        detail: "Current featured sale prices and genres from Steam's public store endpoints.",
      },
      {
        name: "Steam player reviews",
        url: STEAM_REVIEWS_URL,
        status: "live",
        detail: "Lifetime positive share converted to a 5-point rating; not an editorial rating.",
      },
      {
        name: "Metacritic critic scores via Steam",
        url: "https://store.steampowered.com/api/appdetails",
        status: "live",
        detail: "Optional PC critic score and Metacritic link supplied by Steam app details. Only shown when the score and matching game metadata are available; not used in the value ranking.",
      },
      rawgSource(rawgEnabled() ? "live" : "unavailable"),
      {
        name: "Riot Games",
        url: "https://www.riotgames.com/en",
        status: "unavailable",
        detail: "Free-to-play titles are not scored: a zero purchase price makes the formula undefined.",
      },
    ],
    refreshedAt: new Date().toISOString(),
    message: games.length
      ? "Featured Steam discounts with verified player reviews. Results are a curated live subset, not every game on sale."
      : "Steam responded, but no featured games passed the safe-for-work, paid-game, and review filters right now.",
  };
}

export async function getCatalog(platform: Platform, region = "US"): Promise<Catalog> {
  if (platform !== "PC") return getConsoleCatalog(platform, region);

  const cached = cache.get(region);
  if (cached && cached.until > Date.now()) return cached.catalog;
  const existing = inFlight.get(region);
  if (existing) return existing;

  const request = loadSteamCatalog(region)
    .then((catalog) => {
      cache.set(region, { catalog, until: Date.now() + CACHE_MS });
      return catalog;
    })
    .catch(() => {
      if (cached) {
        return {
          ...cached.catalog,
          message: "Steam is temporarily unavailable; showing the last verified catalog. Check the refresh time before buying.",
        };
      }
      return {
        platform: "PC" as const,
        region,
        currency: region === "IN" ? "INR" : "USD",
        games: [],
        sources: [
          {
            name: "Steam Store",
            url: STEAM_DEALS_URL,
            status: "unavailable" as const,
            detail: "The public Steam feed could not be reached.",
          },
        ],
        refreshedAt: null,
        message: "Steam's public feed is temporarily unavailable. Try again later or browse the official store.",
      };
    })
    .finally(() => inFlight.delete(region));
  inFlight.set(region, request);
  return request;
}