import { logger } from "./logger";
import type { Catalog, CatalogGame } from "./steam";

type ConsolePlatform = "Xbox" | "PlayStation";
const XBOX_DEALS = "https://www.microsoft.com/en-us/store/deals/games/xbox";
const PS_DEALS = "https://store.playstation.com/en-us/pages/deals";
// Discovery is intentionally bounded: Sony's public deals page does not server-render
// product links. IDs are only candidates; every offer and rating is read live.
const PS_CANDIDATES = [
  "UP2456-CUSA06840_00-STARDEW00000SIEA",
  "UP1018-PPSA01593_00-HOGWARTSLEGACY01",
  "UP9000-PPSA01317_00-GT7STD0000000PS5",
  "UP0102-PPSA07411_00-RE4RMAINGAME0000",
  "UP9000-PPSA21564_00-0000000000000000",
  "UP2125-PPSA03355_00-3466019145463410",
  "UP0006-PPSA02342_00-ITTAKESTWORETAIL",
  "UP0700-PPSA04610_00-ELDENRING0000000",
  "UP9000-PPSA08329_00-GOWRAGNAROK00000",
];

const ADULT = /\b(hentai|porn|xxx|erotic|sexual|nudity|fetish|adult only|18\+)\b/i;
const cache = new Map<string, { until: number; catalog: Catalog }>();
const inFlight = new Map<string, Promise<Catalog>>();

async function readPage(url: string): Promise<string> {
  const response = await fetch(url, { signal: AbortSignal.timeout(12000) });
  if (!response.ok || response.url.includes("/error?")) throw new Error(`Store page returned ${response.status}`);
  return response.text();
}

function scripts(html: string, pattern: RegExp): unknown[] {
  return [...html.matchAll(pattern)].flatMap((match) => {
    try { return [JSON.parse(match[1]) as unknown]; } catch { return []; }
  });
}

function score(fields: Omit<CatalogGame, "dopeScore">): CatalogGame | null {
  const { originalPrice: original, currentPrice: current, ratingOutOfFive: rating, reviewCount: count } = fields;
  if (!fields.name || ADULT.test(fields.name) || !fields.genre.length ||
    !Number.isFinite(original) || !Number.isFinite(current) || current <= 0 ||
    original <= current || !Number.isFinite(rating) || rating <= 0 || rating > 5 ||
    !Number.isInteger(count) || count < 10 || !/^[A-Z]{3}$/.test(fields.currency)) return null;
  const discountPercent = Math.round((1 - current / original) * 100);
  if (discountPercent <= 0) return null;
  return { ...fields, discountPercent, dopeScore: Math.round(discountPercent * rating / current * 100) / 100 };
}

function xboxCards(html: string) {
  const cards: { id: string; name: string; original: number; current: number; slug: string }[] = [];
  for (const segment of html.split(/<\/li>/)) {
    const match = segment.match(/<div class="card h-100 material-card[^"]*" data-bi-cN="([^"]+)"[^>]*data-bi-pid="([a-z0-9]+)"[^>]*>/);
    const link = segment.match(/<a href="https:\/\/www\.microsoft\.com\/en-us\/p\/([^"]+)"/);
    const prices = segment.match(/<p class="sr-only">Originally \$([\d,.]+) now \$([\d,.]+)/);
    if (!match || !link || !prices) continue;
    const [, name, id] = match;
    const path = link[1];
    const [, original, current] = prices;
    const slug = path.split("/")[0];
    if (path.toLowerCase().endsWith(`/${id.toLowerCase()}`)) {
      cards.push({ id, name, original: Number(original.replace(/,/g, "")), current: Number(current.replace(/,/g, "")), slug });
    }
  }
  return [...new Map(cards.map((card) => [card.id, card])).values()].slice(0, 24);
}

async function xboxGame(card: ReturnType<typeof xboxCards>[number]): Promise<CatalogGame | null> {
  const storeUrl = `https://www.xbox.com/en-US/games/store/${card.slug}/${card.id}`;
  const html = await readPage(storeUrl);
  const graph = scripts(html, /<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)
    .flatMap((script) => (script as { "@graph"?: unknown[] })["@graph"] ?? []);
  const product = graph.find((item) => {
    const entry = item as { "@type"?: string[]; url?: string };
    return entry["@type"]?.includes("VideoGame") && entry.url?.toLowerCase().endsWith(`/${card.id.toLowerCase()}`);
  }) as { name?: string; genre?: string[]; image?: string[]; contentRating?: string; aggregateRating?: { ratingValue?: number; ratingCount?: number; bestRating?: number } } | undefined;
  if (!product || product.name?.toLowerCase() !== card.name.toLowerCase() ||
    !product.contentRating || /\b(MATURE|ADULTS ONLY|PEGI 18)\b/i.test(product.contentRating) ||
    !(product as typeof product & { gamePlatform?: string[] }).gamePlatform?.some((entry) => entry.toUpperCase().includes("XBOX")) ||
    product.aggregateRating?.bestRating !== 5) return null;
  return score({
    id: card.id, name: product.name, platform: "Xbox", provider: "Xbox Store",
    genre: Array.isArray(product.genre) ? product.genre.slice(0, 4) : [],
    imageUrl: product.image?.[0] ?? "", storeUrl, reviewUrl: storeUrl,
    currency: "USD", currentPrice: card.current, originalPrice: card.original,
    discountPercent: 0, ratingOutOfFive: product.aggregateRating.ratingValue ?? NaN,
    reviewCount: product.aggregateRating.ratingCount ?? 0,
  });
}

type PsPrice = { basePriceValue?: number; discountedValue?: number; currencyCode?: string; applicability?: string; isTiedToSubscription?: boolean; isExclusive?: boolean };
type PsEntry = {
  id?: string; name?: string; storeDisplayClassification?: string; starRating?: { averageRating?: number; totalRatingsCount?: number };
  media?: { role?: string; url?: string }[];
  localizedGenres?: { value?: string }[];
  contentRating?: { name?: string };
};

async function playstationGame(id: string): Promise<CatalogGame | null> {
  const storeUrl = `https://store.playstation.com/en-us/product/${id}`;
  const html = await readPage(storeUrl);
  const jsonLd = scripts(html, /<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)
    .find((entry) => (entry as { sku?: string }).sku === id) as { name?: string; image?: string } | undefined;
  if (!jsonLd) return null;
  let product: PsEntry | undefined;
  let price: PsPrice | undefined;
  let genre: string[] = [];
  let contentRating: string | undefined;
  for (const script of scripts(html, /<script id="env:[^"]+" type="application\/json">([\s\S]*?)<\/script>/g)) {
    const entries = (script as { cache?: Record<string, unknown> }).cache ?? {};
    const entry = entries[`Product:${id}`] as PsEntry | undefined;
    if (entry?.id === id) {
      if (entry.starRating) product = entry;
      if (entry.localizedGenres?.length) genre = entry.localizedGenres.map((g) => g.value ?? "").filter(Boolean);
      if (entry.contentRating?.name) contentRating = entry.contentRating.name;
    }
    for (const [key, value] of Object.entries(entries)) {
      // Never use PS Plus upsells, a different edition, or a user's personalized offer.
      if (!key.startsWith(`GameCTA:ADD_TO_CART:ADD_TO_CART:${id}-`) || !key.endsWith(":OUTRIGHT")) continue;
      const offer = (value as { price?: PsPrice }).price;
      if (offer?.applicability === "APPLICABLE" && !offer.isTiedToSubscription && !offer.isExclusive) price = offer;
    }
  }
  if (!product || !["FULL_GAME", "GAME_BUNDLE"].includes(product.storeDisplayClassification ?? "") || !price || !contentRating ||
    /(?:MATURE|ADULTS_ONLY|PEGI_18)/i.test(contentRating) ||
    product.name !== jsonLd.name) return null;
  return score({
    id, name: product.name!, platform: "PlayStation", provider: "PlayStation Store",
    genre, imageUrl: jsonLd.image ?? "", storeUrl, reviewUrl: storeUrl,
    currency: price.currencyCode ?? "", currentPrice: (price.discountedValue ?? NaN) / 100,
    originalPrice: (price.basePriceValue ?? NaN) / 100, discountPercent: 0,
    ratingOutOfFive: product.starRating?.averageRating ?? NaN,
    reviewCount: product.starRating?.totalRatingsCount ?? 0,
  });
}

async function load(platform: ConsolePlatform): Promise<Catalog> {
  const games: CatalogGame[] = [];
  const cards = platform === "Xbox" ? xboxCards(await readPage(XBOX_DEALS)) : PS_CANDIDATES;
  if (!cards.length) throw new Error("Storefront deal cards unavailable");
  let checked = 0;
  for (let i = 0; i < cards.length; i += 4) {
    const batch = await Promise.all(cards.slice(i, i + 4).map(async (candidate) => {
      try {
        const game = await (platform === "Xbox" ? xboxGame(candidate as ReturnType<typeof xboxCards>[number]) : playstationGame(candidate as string));
        checked++;
        return game;
      } catch (error) {
        logger.warn({ platform, candidate: typeof candidate === "string" ? candidate : candidate.id, error }, "Console storefront item unavailable");
        return null;
      }
    }));
    games.push(...batch.filter((game): game is CatalogGame => game !== null));
  }
  if (!checked) throw new Error("No product pages could be checked");
  games.sort((a, b) => b.dopeScore - a.dopeScore);
  const url = platform === "Xbox" ? XBOX_DEALS : PS_DEALS;
  return {
    platform, region: "US", currency: "USD", games, refreshedAt: new Date().toISOString(),
    sources: [
      { name: `${platform} Store prices`, url, status: "live", detail: platform === "Xbox"
        ? "US deal cards on Microsoft's public storefront; product IDs checked against Xbox product pages."
        : "US outright-purchase offers on official PlayStation product pages (bounded candidate selection)." },
      { name: `${platform} player ratings`, url, status: "live", detail: "Storefront player rating and exact rating count from the matching official product page; not an editorial score." },
    ],
    message: games.length
      ? `Verified US ${platform} discounts with storefront player ratings. Only a limited live subset is checked; prices can change at checkout.`
      : `No checked ${platform} titles have a paid discount, valid genre and attributable rating right now.`,
  };
}

export async function getConsoleCatalog(platform: ConsolePlatform, region: string): Promise<Catalog> {
  const url = platform === "Xbox" ? XBOX_DEALS : PS_DEALS;
  if (region !== "US") return {
    platform, region, currency: "", games: [], refreshedAt: null,
    sources: [{ name: `${platform} Store`, url, status: "unavailable", detail: "Only US storefront prices are supported." }],
    message: "This region is not supported; no prices have been converted or guessed.",
  };
  const old = cache.get(platform);
  if (old && old.until > Date.now()) return old.catalog;
  if (inFlight.has(platform)) return inFlight.get(platform)!;
  const request = load(platform).then((catalog) => {
    cache.set(platform, { catalog, until: Date.now() + 15 * 60_000 });
    return catalog;
  }).catch((error): Catalog => {
    logger.warn({ platform, error }, "Console storefront unavailable");
    if (old) return { ...old.catalog, message: "Storefront temporarily unavailable; showing previously verified prices. Check the refresh time before buying." };
    return {
      platform, region, currency: "USD", games: [], refreshedAt: null,
      sources: [{ name: `${platform} Store`, url, status: "unavailable", detail: "Official public storefront pages could not be read." }],
      message: `${platform} storefront data is temporarily unavailable. No prices or ratings have been guessed.`,
    };
  }).finally(() => inFlight.delete(platform));
  inFlight.set(platform, request);
  return request;
}