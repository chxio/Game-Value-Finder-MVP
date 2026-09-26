// Optional RAWG player rating enrichment. Never match games on title alone.
const API = "https://api.rawg.io/api";
const cache = new Map();
const DAY = 24 * 60 * 60 * 1000;

export const rawgEnabled = () =>
  Boolean(process.env.RAWG_API_KEY && process.env.RAWG_USAGE_APPROVED === "true");

export const rawgSource = (status) => ({
  name: "RAWG community ratings",
  url: "https://rawg.io/apidocs",
  status,
  detail: status === "unavailable"
    ? "No verified RAWG player ratings in this catalog. Enrichment requires an API key and confirmed usage rights; Steam remains the value-score basis."
    : "Optional RAWG community ratings, linked only when RAWG's Steam store URL matches the exact app ID. Not included in the value score.",
});

async function request(path, params = {}) {
  const url = new URL(`${API}${path}`);
  url.searchParams.set("key", process.env.RAWG_API_KEY);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, String(value));
  const response = await fetch(url, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`RAWG returned ${response.status}`);
  return response.json();
}

function matchesSteamApp(link, appId) {
  if (typeof link !== "string") return false;
  try {
    const url = new URL(link);
    return url.protocol === "https:" &&
      ["store.steampowered.com", "steampowered.com"].includes(url.hostname) &&
      url.pathname.match(/^\/app\/(\d+)(?:\/|$)/)?.[1] === String(appId);
  } catch {
    return false;
  }
}

export async function findRawgRating(appId, name) {
  if (!rawgEnabled() || !/^\d+$/.test(String(appId)) || !name) return null;
  const id = String(appId);
  const cached = cache.get(id);
  if (cached && cached.until > Date.now()) return cached.rating;
  const found = await request("/games", { search: name, page_size: 5 });
  let rating = null;
  for (const candidate of (Array.isArray(found.results) ? found.results : []).slice(0, 5)) {
    if (!Number.isInteger(candidate?.id) || candidate.id <= 0) continue;
    const stores = await request(`/games/${candidate.id}/stores`, { page_size: 40 });
    if (!Array.isArray(stores.results) ||
      !stores.results.some((store) => matchesSteamApp(store.url, id))) continue;
    // Title search only discovers candidates. The Steam store app ID proves identity.
    if (typeof candidate.slug === "string" && /^[a-z0-9_-]+$/.test(candidate.slug) &&
      typeof candidate.rating === "number" && Number.isFinite(candidate.rating) &&
      candidate.rating > 0 && candidate.rating <= 5 &&
      Number.isInteger(candidate.ratings_count) && candidate.ratings_count >= 10) {
      rating = {
        source: "RAWG community", audience: "players", originalScore: candidate.rating,
        originalScale: 5, ratingOutOfFive: candidate.rating,
        url: `https://rawg.io/games/${candidate.slug}`,
      };
    }
    break;
  }
  cache.set(id, { rating, until: Date.now() + DAY });
  return rating;
}