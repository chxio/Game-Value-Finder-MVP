# Game Value Finder

Game Value Finder ranks discounted games by price, discount, and player rating. Browse PC, Xbox, and PlayStation deals in a web app, then open the source store or review page before buying. The catalog is **not** a complete store inventory or a guaranteed live price feed.

## What it does

- Search by title, filter by genre, price, or discount, and sort by value score, price, discount, or rating.
- Switch between PC, Xbox, and PlayStation; see each listing's source, refresh time, sale price, and player rating.
- Load additional PC deal pages on demand. PC deal links go through CheapShark's redirect to Steam; console links open the matching official store page.
- Compare separately attributed PC ratings where available: Steam players, optional RAWG community players, and Metacritic critics. These are **not averaged**.

The **Dope score** is `(discount percentage points × storefront player rating out of 5) ÷ current price`. For example, a 50% discount, 4/5 rating, and $20 sale price gives a score of 10. The score uses Steam player-review share for PC, and the respective store's player rating for consoles. It does not use RAWG or Metacritic scores. Only paid discounted offers with a valid price and attributable rating are scored; free-to-play titles cannot be scored with a zero price. Compare scores within the same currency (the current catalogs use US storefronts and USD), not across currencies.

## Get started

Use **Node.js 24** and **pnpm**. From the repository root:

```sh
pnpm install
```

In Replit, select the **Project** run workflow and click **Run**. Alternatively, start the managed **API Server** and **Game Value Finder** artifact workflows. Their development commands are:

```sh
pnpm --filter @workspace/api-server run dev
pnpm --filter @workspace/game-value-finder run dev
```

The two services need to run together for the web app to load games. Replit's artifact workflows supply the service ports and route the web app at `/` and the API at `/api`; prefer those workflows to standalone shell commands in Replit. There is **no root `dev` script**.

To check the full workspace or build it:

```sh
pnpm run typecheck
pnpm run build
```

The committed PC workbook at [`artifacts/api-server/data/game-deals.xlsx`](artifacts/api-server/data/game-deals.xlsx) is read at runtime. To replace its snapshot **manually** (requires access to the public CheapShark and Steam APIs):

```sh
pnpm --filter @workspace/api-server run refresh:games
```

This refresh is bounded to one CheapShark deals page and verifies Steam metadata; it is not an automatic bulk crawl. It overwrites the workbook only after enough eligible offers are verified. If you change the [OpenAPI contract](lib/api-spec/openapi.yaml), regenerate the shared client and validation schemas before checking the app:

```sh
pnpm --filter @workspace/api-spec run codegen
```

## API and workspace

The API contract is [`lib/api-spec/openapi.yaml`](lib/api-spec/openapi.yaml). Routes are mounted under `/api`:

| Endpoint | Purpose |
| --- | --- |
| `GET /api/healthz` | Server health |
| `GET /api/games?platform=PC` | Value-ranked catalog; `platform` is `PC`, `Xbox`, or `PlayStation`; optional `genre`, `search`, and `region` |
| `GET /api/games/summary?platform=PC` | Catalog count, genres, top score, and source status |
| `GET /api/games/pc-deals?page=3` | Fetch one additional verified PC deals page on request (zero-based pages 3–50) |

| Location | Role |
| --- | --- |
| [`artifacts/game-value-finder/`](artifacts/game-value-finder/) | React/Vite catalog UI |
| [`artifacts/api-server/`](artifacts/api-server/) | Express API, store adapters, workbook reader, and refresh script |
| [`lib/api-spec/`](lib/api-spec/) | OpenAPI source contract |
| [`lib/api-client-react/`](lib/api-client-react/), [`lib/api-zod/`](lib/api-zod/) | Generated API hooks and schemas |
| [`lib/db/`](lib/db/) | Shared database package |

## Data sources and limitations

- **PC snapshot:** [`artifacts/api-server/data/game-deals.xlsx`](artifacts/api-server/data/game-deals.xlsx) contains a dated, manually captured subset of Steam-store offers from [CheapShark's deals API](https://apidocs.cheapshark.com/) in USD, not all PC deals. CheapShark supplies the price and Steam positive-review percentage; Steam app details supply genres, age/content metadata, and, when present, a Metacritic PC critic score and link. The Steam percentage is converted to a five-point player rating for scoring. Metacritic is a separate critic score, not scraped from Metacritic and not used in ranking. See [PC review provenance](artifacts/api-server/REVIEW_SOURCES.md).
- **Additional PC pages:** Fetched only when requested, from CheapShark and checked against matching Steam app details. Each response has its own capture time. These pages are not saved into the workbook or continuously refreshed.
- **Console subset:** Prices and player ratings are read from matching public official [Xbox](https://www.xbox.com/) and [PlayStation](https://store.playstation.com/) storefront pages, using a bounded set of offers rather than a full-store index. US-only results are cached for 15 minutes; previously verified prices may be shown if a later storefront request fails. Missing or unverifiable offers are omitted, not guessed.
- **Optional RAWG:** RAWG community player ratings are shown separately for PC only when a verified Steam app-ID match is available. They do not affect the score. No RAWG key or approval means no API requests. Before enabling, review the current [RAWG API terms](https://rawg.io/tos_api) and [API plan information](https://rawg.io/apidocs), and get confirmation or a suitable plan for your intended use: the terms and free-plan commercial-use descriptions differ. Once rights are confirmed, set `RAWG_API_KEY` as a Replit secret and the non-secret `RAWG_USAGE_APPROVED=true`, then run the manual workbook refresh. Disabling access does not erase ratings already saved in the workbook; refresh again to remove them.

The catalog screens out adult-only, explicit-content, and 18+ listings using available store metadata and title/content checks; this is a filter, **not an age-rating guarantee**. Eligible PC listings require at least 100 Steam reviews in the CheapShark data; console listings require at least 10 store ratings. Availability depends on the upstream sources and their page formats. Always check the linked store's **current price, region, edition, and checkout terms** before purchasing; even on-demand and cached console prices can change.
