import { useEffect, useMemo, useState } from 'react';
import {
  ArrowUpRight,
  BadgeCheck,
  ChartNoAxesCombined,
  ChevronDown,
  CircleDollarSign,
  CircleHelp,
  Clock3,
  Database,
  ExternalLink,
  Gamepad2,
  Layers3,
  Monitor,
  Radio,
  RefreshCw,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Star,
  Tv,
  TriangleAlert,
  X,
  Zap,
} from 'lucide-react';
import {
  GamePlatform,
  GameSourceStatus,
  getBrowsePcDealsQueryKey,
  getGetGameCatalogQueryKey,
  getGetGameCatalogSummaryQueryKey,
  getHealthCheckQueryKey,
  useGetGameCatalog,
  useGetGameCatalogSummary,
  useBrowsePcDeals,
  useHealthCheck,
  type Game,
  type PcDealPage,
  type GameSource,
} from '@workspace/api-client-react';

const platforms = [
  { value: GamePlatform.PC, label: 'PC', icon: Monitor },
  { value: GamePlatform.Xbox, label: 'Xbox', icon: Gamepad2 },
  { value: GamePlatform.PlayStation, label: 'PlayStation', icon: Tv },
] as const;

function formatMoney(value: number, currency: string) {
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: currency || 'USD',
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    return `${currency || '$'}${value.toFixed(2)}`;
  }
}

function formatRefreshDate(value: string | null | undefined) {
  if (!value) return 'waiting for first refresh';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return `captured ${date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} at ${date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`;
}

function scoreTone(score: number) {
  if (score >= 10) return 'text-[#436600] bg-[#e7f8a9]';
  if (score >= 5) return 'text-[#8a5700] bg-[#fff0bc]';
  return 'text-[#a13a32] bg-[#ffe1db]';
}

function GameArtwork({ game }: { game: Game }) {
  const initials = game.name
    .split(' ')
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();

  return (
    <div className="relative aspect-[16/9] overflow-hidden bg-[#dbe3f0]">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_15%,rgba(223,255,71,.78),transparent_34%),linear-gradient(135deg,#233047,#53647c)]" />
      <div className="absolute -right-8 -top-12 h-40 w-40 rounded-full border-[18px] border-white/10" />
      <div className="absolute -bottom-20 left-1/3 h-48 w-48 rounded-full border-[28px] border-[#ff715f]/20" />
      <div className="absolute bottom-4 left-5 max-w-[78%] text-5xl font-bold tracking-[-.08em] text-white/85 gvf-display">
        {initials}
      </div>
      <img
        src={game.imageUrl}
        alt={`${game.name} cover art`}
        className="absolute inset-0 h-full w-full object-cover transition duration-500 group-hover:scale-105"
        data-testid={`img-game-${game.id}`}
        onError={(event) => {
          event.currentTarget.style.display = 'none';
        }}
      />
      <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-[#111827]/70 to-transparent" />
      <div className="absolute left-3 top-3 flex items-center gap-1.5 rounded-full bg-[#111827]/75 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[.13em] text-white backdrop-blur-sm">
        <Zap className="h-3 w-3 text-[#dfff47]" aria-hidden="true" />
        value pick
      </div>
      <div className="absolute bottom-3 right-3 rounded-md bg-[#111827]/75 px-2 py-1 font-mono text-[10px] text-white/90 backdrop-blur-sm">
        {game.platform}
      </div>
    </div>
  );
}

function GameCard({ game, index, priceCapturedAt }: { game: Game; index: number; priceCapturedAt?: string | null }) {
  const isDealLink = game.provider.includes('CheapShark');
  return (
    <article
      className="group gvf-rise overflow-hidden rounded-2xl border border-[#dce2ec] bg-white shadow-[0_8px_25px_rgba(31,42,63,.045)] transition duration-300 hover:-translate-y-1 hover:border-[#bac5d5] hover:shadow-[0_18px_38px_rgba(31,42,63,.12)]"
      style={{ animationDelay: `${index * 55}ms` }}
      data-testid={`card-game-${game.id}`}
    >
      <GameArtwork game={game} />
      <div className="p-4 sm:p-5">
        <div className="mb-2 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="mb-1 truncate font-mono text-[10px] uppercase tracking-[.16em] text-[#8490a5]">
              {game.provider}
            </p>
            <h3 className="truncate text-[17px] font-extrabold tracking-[-.035em] text-[#1e2940]" data-testid={`text-game-name-${game.id}`}>
              {game.name}
            </h3>
          </div>
          <div className={`shrink-0 rounded-lg px-2 py-1 text-center ${scoreTone(game.dopeScore)}`}>
            <div className="font-mono text-[9px] font-bold uppercase tracking-[.1em]">DOPE</div>
            <div className="text-lg font-extrabold leading-none" data-testid={`text-score-${game.id}`}>{game.dopeScore.toFixed(1)}</div>
          </div>
        </div>

        <div className="mb-4 flex flex-wrap gap-1.5">
          {game.genre.slice(0, 3).map((genre) => (
            <span key={genre} className="rounded-md bg-[#f0f3f8] px-2 py-1 text-[10px] font-semibold text-[#657088]">
              {genre}
            </span>
          ))}
        </div>

        <div className="mb-4 grid grid-cols-3 divide-x divide-[#e5e8ef] rounded-xl border border-[#e5e8ef] bg-[#fbfcfd] py-2.5">
          <div className="px-2 text-center">
            <div className="mb-1 text-[10px] uppercase tracking-[.09em] text-[#9099aa]">now</div>
            <div className="font-mono text-[14px] font-medium text-[#1e2940]" data-testid={`text-price-${game.id}`}>
              {formatMoney(game.currentPrice, game.currency)}
            </div>
          </div>
          <div className="px-2 text-center">
            <div className="mb-1 text-[10px] uppercase tracking-[.09em] text-[#9099aa]">off</div>
            <div className="font-mono text-[14px] font-medium text-[#dc5a49]">−{game.discountPercent}%</div>
          </div>
          <div className="px-2 text-center">
            <div className="mb-1 flex items-center justify-center gap-1 text-[10px] uppercase tracking-[.09em] text-[#9099aa]">
              <Star className="h-2.5 w-2.5 fill-[#f2bb4b] text-[#f2bb4b]" aria-hidden="true" /> rating
            </div>
            <div className="font-mono text-[14px] font-medium text-[#1e2940]">
              {game.ratingOutOfFive.toFixed(1)}<span className="text-[10px] text-[#8e98aa]"> / 5</span>
            </div>
          </div>
        </div>

        <div className="mb-4 flex items-center justify-between text-[11px] text-[#7d8799]">
          <span>{game.reviewCount.toLocaleString()} {game.platform === GamePlatform.PC ? 'Steam reviews · snapshot' : `ratings · ${game.provider}`}</span>
          <span className="line-through">{formatMoney(game.originalPrice, game.currency)}</span>
        </div>
        {game.platform === GamePlatform.PC && (
          <p className="mb-3 text-[11px] text-[#7d8799]">Price {formatRefreshDate(priceCapturedAt)} · not live</p>
        )}
        {game.platform === GamePlatform.PC && (
          <div className="mb-4 rounded-lg border border-[#e5e8ef] bg-[#fbfcfd] px-3 py-2 text-[11px] text-[#657088]">
            <p className="mb-1 font-semibold text-[#27334b]">Rating comparison</p>
            {(game.ratings ?? []).map((rating) => (
              <div key={rating.source} className="flex items-center justify-between gap-2 py-0.5">
                <a href={rating.url} target="_blank" rel="noreferrer" className="underline underline-offset-2 hover:text-[#27334b]">
                  {rating.source} {rating.audience === 'critics' ? '(critics)' : '(players)'}
                </a>
                <span className="shrink-0 font-mono">{rating.originalScore}/{rating.originalScale} · {rating.ratingOutOfFive.toFixed(1)}/5</span>
              </div>
            ))}
            {!game.ratings?.some((rating) => rating.audience === 'critics') && (
              <p className="py-0.5">Metacritic critic score not available for this game.</p>
            )}
            <p className="mt-1 border-t border-[#e5e8ef] pt-1">Value score uses {game.scoreBasis ?? 'Steam player reviews'} only; no critic/player average.</p>
          </div>
        )}

        <div className="flex gap-2">
          <a
            href={game.storeUrl}
            target="_blank"
            rel="noreferrer"
            className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-[#202a40] px-3 py-2.5 text-xs font-bold text-white transition hover:bg-[#303d58] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#dfff47] focus-visible:ring-offset-2"
            data-testid={`link-store-${game.id}`}
          >
            {isDealLink ? 'View deal' : 'Visit store'} <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
          </a>
          <a
            href={game.reviewUrl}
            target="_blank"
            rel="noreferrer"
            className="flex items-center justify-center rounded-lg border border-[#dce2ec] px-3 text-[#5f6b80] transition hover:border-[#9ba8bb] hover:text-[#202a40] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#dfff47] focus-visible:ring-offset-2"
            aria-label={`View ${game.platform === GamePlatform.PC ? 'reviews' : 'ratings'} for ${game.name}`}
            data-testid={`link-review-${game.id}`}
          >
            <ChartNoAxesCombined className="h-4 w-4" aria-hidden="true" />
          </a>
        </div>
      </div>
    </article>
  );
}

function SourceRow({ source }: { source: GameSource }) {
  const isLive = source.status === GameSourceStatus.live;
  const isSnapshot = source.status === GameSourceStatus.snapshot;
  return (
    <div className="flex items-start gap-3 border-b border-[#e8ebf1] py-3 last:border-0" data-testid={`source-row-${source.name}`}>
      <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${isLive ? 'bg-[#75a80a]' : isSnapshot ? 'bg-[#dba236]' : 'bg-[#dc5a49]'}`} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <a href={source.url} target="_blank" rel="noreferrer" className="text-sm font-bold text-[#27334b] underline decoration-[#dce2ec] underline-offset-4 hover:decoration-[#27334b]" data-testid={`link-source-${source.name}`}>
            {source.name}
            <ExternalLink className="ml-1 inline h-3 w-3" aria-hidden="true" />
          </a>
          <span className={`font-mono text-[9px] uppercase tracking-[.12em] ${isLive ? 'text-[#689000]' : isSnapshot ? 'text-[#9a6900]' : 'text-[#bc4f42]'}`}>
            {isLive ? 'live feed' : isSnapshot ? 'dated snapshot' : 'unavailable'}
          </span>
        </div>
        <p className="mt-1 text-xs leading-relaxed text-[#7d8799]">{source.detail}</p>
      </div>
    </div>
  );
}

function CatalogSkeleton() {
  return (
    <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3" data-testid="loading-catalog">
      {[0, 1, 2, 3, 4, 5].map((item) => (
        <div key={item} className="overflow-hidden rounded-2xl border border-[#e1e6ef] bg-white">
          <div className="gvf-shimmer aspect-[16/9]" />
          <div className="space-y-3 p-5">
            <div className="gvf-shimmer h-3 w-1/3 rounded" />
            <div className="gvf-shimmer h-5 w-3/4 rounded" />
            <div className="gvf-shimmer h-16 rounded-xl" />
            <div className="gvf-shimmer h-10 rounded-lg" />
          </div>
        </div>
      ))}
    </div>
  );
}

function EmptyPanel({ type, onClear, sourceUrl }: { type: 'unavailable' | 'empty'; onClear?: () => void; sourceUrl?: string }) {
  if (type === 'unavailable') {
    return (
      <div className="gvf-grid flex min-h-[360px] flex-col items-center justify-center rounded-2xl border border-dashed border-[#cfd7e4] bg-white px-6 text-center" data-testid="state-unavailable">
        <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-[#fff0bc] text-[#9a6900]">
          <Radio className="h-6 w-6" aria-hidden="true" />
        </div>
        <p className="mb-2 font-mono text-[10px] font-bold uppercase tracking-[.2em] text-[#a47714]">source unavailable</p>
        <h2 className="gvf-display text-2xl font-bold text-[#27334b]">Store data is unavailable right now.</h2>
        <p className="mt-2 max-w-md text-sm leading-relaxed text-[#7d8799]">
          We do not fill gaps with guesses. Try again later or browse the official store.
        </p>
        {sourceUrl && (
          <a href={sourceUrl} target="_blank" rel="noreferrer" className="mt-5 inline-flex items-center gap-2 rounded-lg bg-[#202a40] px-4 py-2.5 text-xs font-bold text-white hover:bg-[#303d58]" data-testid="link-official-platform-store">
            Browse official store <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
          </a>
        )}
      </div>
    );
  }

  return (
    <div className="flex min-h-[360px] flex-col items-center justify-center rounded-2xl border border-dashed border-[#cfd7e4] bg-white px-6 text-center" data-testid="state-no-results">
      <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-[#e9edf5] text-[#60708a]">
        <Search className="h-6 w-6" aria-hidden="true" />
      </div>
      <p className="mb-2 font-mono text-[10px] font-bold uppercase tracking-[.2em] text-[#7d8799]">no matches</p>
      <h2 className="gvf-display text-2xl font-bold text-[#27334b]">No verified deals matched.</h2>
      <p className="mt-2 max-w-md text-sm leading-relaxed text-[#7d8799]">Only discounted paid games with storefront ratings appear here. Try a broader title or clear the genre filter.</p>
      {onClear && (
        <button type="button" onClick={onClear} className="mt-5 inline-flex items-center gap-2 rounded-lg bg-[#202a40] px-4 py-2.5 text-xs font-bold text-white hover:bg-[#303d58]" data-testid="button-clear-filters">
          <X className="h-3.5 w-3.5" aria-hidden="true" /> Clear filters
        </button>
      )}
    </div>
  );
}

function Home() {
  const [platform, setPlatform] = useState<GamePlatform>(GamePlatform.PC);
  const [search, setSearch] = useState('');
  const [genre, setGenre] = useState('');
  const [requestedPage, setRequestedPage] = useState<number | null>(null);
  const [loadedPages, setLoadedPages] = useState<PcDealPage[]>([]);

  const catalogParams = useMemo(() => ({
    platform,
    region: 'US',
    genre: genre || undefined,
    search: search.trim() || undefined,
  }), [genre, platform, search]);

  const catalog = useGetGameCatalog(catalogParams, {
    query: { queryKey: getGetGameCatalogQueryKey(catalogParams) },
  });
  const extraDeals = useBrowsePcDeals({ page: requestedPage ?? 3 }, {
    query: { queryKey: getBrowsePcDealsQueryKey({ page: requestedPage ?? 3 }), enabled: platform === GamePlatform.PC && requestedPage !== null, retry: false, staleTime: 0, refetchOnWindowFocus: false },
  });
  useEffect(() => {
    if (!extraDeals.data || requestedPage === null || extraDeals.data.page !== requestedPage) return;
    setLoadedPages((previous) => previous.some((entry) => entry.page === extraDeals.data!.page)
      ? previous.map((entry) => entry.page === extraDeals.data!.page ? extraDeals.data! : entry)
      : [...previous, extraDeals.data!]);
  }, [extraDeals.data, requestedPage]);
  const summary = useGetGameCatalogSummary({ platform }, {
    query: { queryKey: getGetGameCatalogSummaryQueryKey({ platform }), staleTime: 120000 },
  });
  const health = useHealthCheck({
    query: { queryKey: getHealthCheckQueryKey(), staleTime: 300000, retry: 1 },
  });

  const games = useMemo(() => {
    const snapshot = catalog.data?.games ?? [];
    if (platform !== GamePlatform.PC) return snapshot;
    const seen = new Set(snapshot.map((game) => game.id));
    const additional = loadedPages.flatMap((page) => page.games).filter((game) => {
      if (seen.has(game.id)) return false;
      seen.add(game.id);
      return (!genre || genre === 'All' || game.genre.includes(genre)) &&
        (!search.trim() || game.name.toLowerCase().includes(search.trim().toLowerCase()));
    });
    return [...snapshot, ...additional].sort((a, b) => b.dopeScore - a.dopeScore);
  }, [catalog.data?.games, genre, loadedPages, platform, search]);
  const latestPage = loadedPages.at(-1);
  const sources = platform === GamePlatform.PC && latestPage
    ? [...(catalog.data?.sources ?? []), ...latestPage.sources.slice(0, 2)]
    : catalog.data?.sources ?? [];
  const genres = useMemo(() => [...new Set([
    ...(summary.data?.genres ?? []),
    ...(platform === GamePlatform.PC ? loadedPages.flatMap((page) => page.games.flatMap((game) => game.genre)) : []),
  ])].sort(), [summary.data?.genres, platform, loadedPages]);
  const allSourcesUnavailable = sources.length > 0 && sources.every((source) => source.status === GameSourceStatus.unavailable);
  const isUnavailable = summary.data?.sourceStatus === GameSourceStatus.unavailable || allSourcesUnavailable;
  const clearFilters = () => {
    setSearch('');
    setGenre('');
  };
  const nextPage = loadedPages.length ? (latestPage?.page ?? 2) + 1 : 3;
  const canBrowseMore = platform === GamePlatform.PC && (!latestPage || latestPage.hasMore);
  const browseNext = () => {
    if (extraDeals.isError && requestedPage === nextPage) void extraDeals.refetch();
    else setRequestedPage(nextPage);
  };
  const priceCapturedAt = (game: Game) =>
    loadedPages.find((page) => page.games.some((item) => item.id === game.id))?.refreshedAt ?? catalog.data?.refreshedAt;

  return (
    <div className="gvf-noise min-h-[100dvh] text-[#202a40]">
      <header className="border-b border-[#dce2ec] bg-[#202a40] text-white">
        <div className="mx-auto flex max-w-[1480px] items-center justify-between gap-4 px-5 py-4 lg:px-10">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#dfff47] text-[#202a40]">
              <Zap className="h-5 w-5 fill-current" aria-hidden="true" />
            </div>
            <div>
              <div className="gvf-display text-lg font-bold leading-none tracking-[-.04em]">Game Value Finder</div>
              <div className="mt-1 font-mono text-[9px] uppercase tracking-[.18em] text-white/45">buy less blind</div>
            </div>
          </div>
          <div className="hidden items-center gap-2 text-[11px] text-white/60 sm:flex">
            <span className={`h-1.5 w-1.5 rounded-full ${health.isError ? 'bg-[#ff715f]' : 'bg-[#dfff47]'}`} />
            {health.isError ? 'service offline' : 'service online'}
            <CircleHelp className="ml-1 h-3.5 w-3.5 text-white/35" aria-hidden="true" />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1480px] px-5 pb-16 lg:px-10">
        <section className="relative overflow-hidden border-b border-[#dce2ec] py-10 sm:py-14 lg:py-16">
          <div className="pointer-events-none absolute -right-8 top-5 hidden select-none font-mono text-[9rem] font-bold leading-none tracking-[-.16em] text-[#e8edf5] xl:block">VALUE</div>
          <div className="relative max-w-3xl">
            <div className="mb-5 flex items-center gap-2 font-mono text-[10px] font-bold uppercase tracking-[.19em] text-[#7b890f]">
              <span className="h-2 w-2 rounded-full bg-[#dfff47]" />
              verified deal intelligence
            </div>
            <h1 className="gvf-display max-w-3xl text-[clamp(2.7rem,6vw,6.2rem)] font-bold leading-[.92] text-[#202a40]">
              Find the games<br /><span className="text-[#6e8500]">worth your money.</span>
            </h1>
            <p className="mt-6 max-w-xl text-base leading-relaxed text-[#68748a] sm:text-lg">
              A value-ranked shelf of real deals, with every score traceable to a price and a review source. No hype. No mystery math.
            </p>
          </div>

          <div className="relative mt-9 flex max-w-3xl flex-col gap-3 sm:flex-row">
            <label className="group relative flex min-h-12 flex-1 items-center rounded-xl border border-[#cfd7e4] bg-white shadow-[0_8px_20px_rgba(31,42,63,.04)] focus-within:border-[#879b16] focus-within:ring-2 focus-within:ring-[#dfff47]/60">
              <Search className="ml-4 h-4 w-4 shrink-0 text-[#8893a7]" aria-hidden="true" />
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search a game title..."
                className="h-full w-full bg-transparent px-3 text-sm font-medium text-[#202a40] outline-none placeholder:text-[#9aa3b2]"
                data-testid="input-game-search"
              />
              {search && <button type="button" onClick={() => setSearch('')} className="mr-3 text-[#8a95a8] hover:text-[#202a40]" aria-label="Clear search" data-testid="button-clear-search"><X className="h-4 w-4" /></button>}
            </label>
            <div className="relative">
              <SlidersHorizontal className="pointer-events-none absolute left-4 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-[#758198]" aria-hidden="true" />
              <select
                value={genre}
                onChange={(event) => setGenre(event.target.value)}
                className="min-h-12 w-full appearance-none rounded-xl border border-[#cfd7e4] bg-white pl-11 pr-11 text-sm font-semibold text-[#4f5c73] outline-none focus:border-[#879b16] focus:ring-2 focus:ring-[#dfff47]/60 sm:w-52"
                data-testid="select-genre"
              >
                <option value="">All genres</option>
                {genres.map((item) => <option value={item} key={item}>{item}</option>)}
              </select>
              <ChevronDown className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#758198]" aria-hidden="true" />
            </div>
          </div>
        </section>

        <section className="border-b border-[#dce2ec] py-6" aria-label="Platform selector">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2 font-mono text-[10px] font-bold uppercase tracking-[.17em] text-[#7d8799]">
              <Layers3 className="h-3.5 w-3.5" aria-hidden="true" /> Browse platform
            </div>
            <div className="flex w-full gap-1 rounded-xl border border-[#dce2ec] bg-[#eef1f6] p-1 sm:w-auto">
              {platforms.map(({ value, label, icon: Icon }) => (
                <button
                  type="button"
                  key={value}
                  onClick={() => {
                    if (platform !== value) {
                      setRequestedPage(null);
                      setLoadedPages([]);
                    }
                    setPlatform(value);
                    setGenre('');
                  }}
                  className={`flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-xs font-bold transition sm:flex-none ${platform === value ? 'bg-[#202a40] text-white shadow-sm' : 'text-[#758198] hover:text-[#202a40]'}`}
                  data-testid={`button-platform-${value.toLowerCase()}`}
                >
                  <Icon className={`h-4 w-4 ${platform === value ? 'text-[#dfff47]' : ''}`} aria-hidden="true" />
                  {label}
                </button>
              ))}
            </div>
          </div>
        </section>

        <section className="grid gap-3 py-6 sm:grid-cols-3">
          <div className="rounded-xl border border-[#dce2ec] bg-white p-4">
            <div className="mb-3 flex items-center justify-between text-[#8792a5]"><span className="font-mono text-[10px] uppercase tracking-[.15em]">catalog size</span><Database className="h-4 w-4" aria-hidden="true" /></div>
            <div className="gvf-display text-3xl font-bold text-[#202a40]" data-testid="text-catalog-count">{summary.data?.gameCount ?? '—'}</div>
            <div className="mt-1 text-xs text-[#8792a5]">{platform === GamePlatform.PC ? 'verified games in saved snapshot' : `ranked games in ${platform}`}</div>
          </div>
          <div className="rounded-xl border border-[#dce2ec] bg-white p-4">
            <div className="mb-3 flex items-center justify-between text-[#8792a5]"><span className="font-mono text-[10px] uppercase tracking-[.15em]">top dope score</span><BadgeCheck className="h-4 w-4" aria-hidden="true" /></div>
            <div className="gvf-display text-3xl font-bold text-[#6e8500]" data-testid="text-top-score">{summary.data ? summary.data.topDopeScore.toFixed(1) : '—'}</div>
                <div className="mt-1 text-xs text-[#8792a5]">discount points × rating ÷ price</div>
          </div>
          <div className="rounded-xl border border-[#dce2ec] bg-white p-4">
            <div className="mb-3 flex items-center justify-between text-[#8792a5]"><span className="font-mono text-[10px] uppercase tracking-[.15em]">data freshness</span><Clock3 className="h-4 w-4" aria-hidden="true" /></div>
            <div className="text-lg font-bold text-[#202a40]">{catalog.data?.refreshedAt ? (catalog.data.sources[0]?.status === GameSourceStatus.snapshot ? 'Snapshot' : 'Current') : 'Pending'}</div>
            <div className="mt-1 truncate text-xs text-[#8792a5]">{formatRefreshDate(catalog.data?.refreshedAt)}</div>
          </div>
        </section>

        <section className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_285px]">
          <div className="min-w-0">
            <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="mb-1 font-mono text-[10px] uppercase tracking-[.18em] text-[#7d8799]">ranked shelf · {platform}</p>
                <h2 className="gvf-display text-3xl font-bold tracking-[-.045em] text-[#202a40]" data-testid="heading-catalog">
                  {search ? `Matches for “${search}”` : 'Worth a closer look'}
                </h2>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <div className="font-mono text-[10px] uppercase tracking-[.13em] text-[#8993a5]">{games.length} shown · highest value first</div>
                {canBrowseMore && <a href="#pc-deal-pagination" className="text-xs font-bold text-[#6e8500] underline underline-offset-4">Browse more PC deals ↓</a>}
              </div>
            </div>

            {catalog.isLoading ? <CatalogSkeleton /> : catalog.isError ? (
              <div className="flex min-h-[360px] flex-col items-center justify-center rounded-2xl border border-[#ffd3cd] bg-[#fff7f5] px-6 text-center" data-testid="state-catalog-error">
                <TriangleAlert className="mb-4 h-8 w-8 text-[#d35a4e]" aria-hidden="true" />
                <h2 className="gvf-display text-2xl font-bold text-[#7e332c]">The feed missed a beat.</h2>
                <p className="mt-2 max-w-sm text-sm leading-relaxed text-[#a15a52]">We could not verify this catalog right now. Try again in a moment.</p>
                <button type="button" onClick={() => catalog.refetch()} className="mt-5 inline-flex items-center gap-2 rounded-lg bg-[#202a40] px-4 py-2.5 text-xs font-bold text-white hover:bg-[#303d58]" data-testid="button-retry-catalog">
                  <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" /> Retry feed
                </button>
              </div>
            ) : isUnavailable && !loadedPages.length ? <EmptyPanel type="unavailable" sourceUrl={sources[0]?.url} /> : games.length === 0 ? (
              <EmptyPanel type="empty" onClear={clearFilters} />
            ) : (
              <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
                {games.map((game, index) => <GameCard key={game.id} game={game} index={index} priceCapturedAt={priceCapturedAt(game)} />)}
              </div>
            )}
            {platform === GamePlatform.PC && (
              <div id="pc-deal-pagination" className="mt-7 rounded-xl border border-[#dce2ec] bg-white p-5" data-testid="pc-deal-pagination">
                <h3 className="text-sm font-bold text-[#202a40]">More PC deals</h3>
                <p className="mt-1 text-xs leading-relaxed text-[#748097]">
                  The saved snapshot covers the first 60 deal candidates. Each click requests one later page of up to 20 candidates and checks Steam age/content metadata before showing any games. Search and genre filters apply to pages you have loaded. Pages are not stored as a bulk catalog; prices are captured on request, not live.
                </p>
                {latestPage && <p className="mt-2 text-xs text-[#748097]">Page {latestPage.page + 1}: {latestPage.games.length} verified safe games · {formatRefreshDate(latestPage.refreshedAt)}. {latestPage.hasMore ? 'More pages may be available.' : 'No further page available.'}</p>}
                {extraDeals.isError && <p className="mt-2 text-xs font-semibold text-[#a13a32]" role="alert">Could not verify this page right now. Try again later; previously loaded games remain visible.</p>}
                {canBrowseMore && (
                  <button
                    type="button"
                    disabled={extraDeals.isFetching}
                    onClick={browseNext}
                    className="mt-4 inline-flex items-center gap-2 rounded-lg bg-[#202a40] px-4 py-2.5 text-xs font-bold text-white hover:bg-[#303d58] disabled:cursor-wait disabled:opacity-60"
                    data-testid="button-browse-pc-deals"
                  >
                    {extraDeals.isFetching ? 'Checking Steam metadata…' : extraDeals.isError ? 'Retry this page' : `Browse next PC deals · page ${nextPage + 1}`}
                  </button>
                )}
              </div>
            )}
          </div>

          <aside className="space-y-5">
            <div className="rounded-2xl border border-[#dce2ec] bg-white p-5">
              <div className="mb-4 flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-[#6e8500]" aria-hidden="true" />
                <h3 className="text-sm font-extrabold text-[#202a40]">How we score value</h3>
              </div>
              <div className="rounded-xl bg-[#202a40] p-4 text-center text-white">
                <div className="font-mono text-[9px] uppercase tracking-[.17em] text-[#dfff47]">the dope score</div>
                <div className="my-3 text-[19px] font-bold tracking-[-.04em] text-[#f9fbff]">
                  (discount % <span className="text-[#dfff47]">×</span> rating out of 5) <span className="text-[#dfff47]">÷</span> current price
                </div>
                <div className="border-t border-white/10 pt-3 text-[10px] leading-relaxed text-white/55">Higher means more verified game for your money. Ratings stay attributed to their source.</div>
              </div>
              <div className="mt-4 space-y-3 text-xs leading-relaxed text-[#748097]">
                <div className="flex gap-2"><CircleDollarSign className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#6e8500]" aria-hidden="true" /><span>Prices are from the US storefront in USD. Checkout prices may vary by location.</span></div>
                <div className="flex gap-2"><BadgeCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#6e8500]" aria-hidden="true" /><span>PC deal links go through CheapShark to Steam. Verify the price before buying; Steam player and optional Metacritic PC critic scores are shown separately on a 5-point display scale. The value ranking uses Steam only.</span></div>
              </div>
            </div>

            <div className="rounded-2xl border border-[#dce2ec] bg-white p-5">
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-sm font-extrabold text-[#202a40]">Source ledger</h3>
                <span className="font-mono text-[9px] uppercase tracking-[.13em] text-[#8490a5]">{catalog.data?.region || 'US'} / {catalog.data?.currency || 'USD'}</span>
              </div>
              <p className="mb-3 text-xs leading-relaxed text-[#7d8799]">{catalog.data?.message || 'Live status for the sources feeding this shelf.'}</p>
              {sources.length > 0 ? sources.map((source) => <SourceRow source={source} key={source.name} />) : (
                <div className="rounded-lg bg-[#f3f5f8] p-3 text-xs text-[#7d8799]" data-testid="status-sources-pending">Source details appear when the feed responds.</div>
              )}
            </div>
          </aside>
        </section>
      </main>

      <footer className="border-t border-[#dce2ec] bg-[#f0f3f8]">
        <div className="mx-auto flex max-w-[1480px] flex-col gap-2 px-5 py-6 text-[11px] text-[#7d8799] sm:flex-row sm:items-center sm:justify-between lg:px-10">
          <span className="font-mono uppercase tracking-[.12em]">Game Value Finder · data before dopamine</span>
          <span className="flex items-center gap-1.5"><ShieldCheck className="h-3.5 w-3.5 text-[#6e8500]" aria-hidden="true" /> Adults-only content is not included.</span>
        </div>
      </footer>
    </div>
  );
}

export default Home;