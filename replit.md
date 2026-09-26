# Game Value Finder

A value-ranked game-deals website comparing a dated PC deals snapshot and live console discounts with attributable storefront ratings.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- The PC catalog is read from `artifacts/api-server/data/game-deals.xlsx`. Refresh it manually with `pnpm --filter @workspace/api-server run refresh:games`; the refresh uses one bounded CheapShark deals page and verifies safety/genres against public Steam metadata.

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/game-value-finder/src/pages/home.tsx` — catalog UI and platform/genre filters.
- `artifacts/api-server/src/lib/workbook-catalog.ts` — reads the dated PC deal workbook and recomputes scores from its price and rating columns.
- `artifacts/api-server/scripts/refresh-game-deals.mjs` — rebuilds the workbook from a bounded CheapShark browse page and verifies Steam metadata for adult-content exclusion.
- `artifacts/api-server/src/lib/steam.ts` — Steam adapter retained for legacy PC calls and console routing.
- `artifacts/api-server/src/lib/console-stores.ts` — bounded Xbox and PlayStation public storefront offers, ratings, safety checks and caching.
- `artifacts/api-server/src/routes/games.ts` — validated catalog and summary API routes.
- `lib/api-spec/openapi.yaml` — API contract; regenerate clients after changing it.

## Architecture decisions

- The dope score uses percentage points, not a fractional discount: `(discountPercent × ratingOutOfFive) / currentPrice`. Prices currently use the US Steam storefront and USD, so scores are comparable within that currency only.
- Paid sale items with at least 10 player reviews are eligible. Free-to-play titles have a zero denominator and are not scored.
- PC pricing and Steam player-rating percentages are a dated CheapShark API snapshot (USD), not a live feed. The backend reads the workbook and reloads it when changed. It does not bulk-crawl or automatically poll the provider; deal links must use CheapShark redirects. The workbook covers one page, not the entire store.
- Console deals and player ratings come from matching public official Xbox and PlayStation storefront pages. The US console catalog is a limited live subset cached for 15 minutes, not a full-store index. Never invent missing offers or scores.

## Product

- Switch between PC, Xbox, and PlayStation; search, filter by genre, and browse games ranked by dope score.
- Open each listed PC game's deal through CheapShark's required redirect to Steam and its Steam player-review page.
- See provider status, refresh time, and unavailable-source explanations. Adult-only, explicit-content, and 18+ listings are excluded from the scored catalog.
- Open console game pages to check current prices and the displayed player rating; PC deals continue through CheapShark redirects.

## User preferences

- Use publicly available information from official game providers and public review sources; exclude adult games.

## Gotchas

- CheapShark's public API requires a descriptive User-Agent and deal-redirect links; it discourages automated bulk catalog harvesting. Keep workbook refreshes manual and bounded, and mark prices as a dated snapshot.
- Steam app-detail responses can be inconsistent. Keep source attribution and fail closed when a listing cannot be verified.
- A new OpenAPI response shape requires `pnpm --filter @workspace/api-spec run codegen` before frontend/server typechecks.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
