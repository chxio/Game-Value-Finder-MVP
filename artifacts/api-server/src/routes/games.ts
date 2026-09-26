import { Router, type IRouter } from "express";
import {
  GetGameCatalogQueryParams,
  GetGameCatalogResponse,
  GetGameCatalogSummaryQueryParams,
  GetGameCatalogSummaryResponse,
  BrowsePcDealsQueryParams,
  BrowsePcDealsResponse,
} from "@workspace/api-zod";
import { getCatalog } from "../lib/steam";
import { getWorkbookCatalog } from "../lib/workbook-catalog";
import { browsePcDeals } from "../lib/pc-deals";

const router: IRouter = Router();

router.get("/games/pc-deals", async (req, res): Promise<void> => {
  const parsed = BrowsePcDealsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  try {
    res.set("Cache-Control", "no-store");
    res.json(BrowsePcDealsResponse.parse(await browsePcDeals(parsed.data.page)));
  } catch (error) {
    req.log.warn({ error }, "On-demand PC deals unavailable");
    res.status(503).json({ error: "The deal source or Steam verification is unavailable. Try again later." });
  }
});

router.get("/games", async (req, res): Promise<void> => {
  const parsed = GetGameCatalogQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { platform, genre, search } = parsed.data;
  const region = (parsed.data.region ?? "US").toUpperCase();
  const catalog = platform === "PC"
    ? await getWorkbookCatalog()
    : await getCatalog(platform, region);
  const query = search?.trim().toLowerCase();
  const games = catalog.games.filter(
    (game) =>
      (!genre || genre === "All" || game.genre.includes(genre)) &&
      (!query || game.name.toLowerCase().includes(query)),
  );
  res.json(GetGameCatalogResponse.parse({ ...catalog, games }));
});

router.get("/games/summary", async (req, res): Promise<void> => {
  const parsed = GetGameCatalogSummaryQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const catalog = parsed.data.platform === "PC"
    ? await getWorkbookCatalog()
    : await getCatalog(parsed.data.platform);
  const genres = [...new Set(catalog.games.flatMap((game) => game.genre))].sort();
  res.json(
    GetGameCatalogSummaryResponse.parse({
      platform: parsed.data.platform,
      gameCount: catalog.games.length,
      topDopeScore: catalog.games[0]?.dopeScore ?? 0,
      genres,
      sourceStatus: catalog.sources[0]?.status ?? "unavailable",
    }),
  );
});

export default router;