import type { PriceMode, PricePoint, PriceSnapshot, PriceSource } from "@/lib/types";

/**
 * SOL/USD quote store for one Node process.
 *
 * PRICE_SOURCE=fallback polls a public market URL (works on localhost).
 * PRICE_SOURCE=quicknode prefers prices POSTed to /api/quicknode and uses the
 * public feed when that stream has been quiet for QUICKNODE_MAX_AGE_MS.
 *
 * The store lives on globalThis so the webhook and the price route share it
 * across dev-server module reloads.
 */

const HISTORY_LIMIT = 60;
const FALLBACK_TTL_MS = 3_000;
const FETCH_TIMEOUT_MS = 4_000;
const DEFAULT_QUICKNODE_MAX_AGE_MS = 30_000;
const MIN_PRICE_USD = 0.01;
const MAX_PRICE_USD = 1_000_000;

const DEFAULT_FALLBACK_URL = "https://api.coinbase.com/v2/prices/SOL-USD/spot";
const DEFAULT_BACKUP_URL =
  "https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd";

type StoredPoint = PricePoint & {
  source: PriceSource;
};

type PriceMemory = {
  latest: StoredPoint | null;
  history: StoredPoint[];
  fallbackFetchedAt: number;
  inflight: Promise<StoredPoint | null> | null;
};

const MEMORY_KEY = "__botRoyalePrice";

function memory(): PriceMemory {
  const host = globalThis as typeof globalThis & {
    [MEMORY_KEY]?: PriceMemory;
  };
  if (!host[MEMORY_KEY]) {
    host[MEMORY_KEY] = {
      latest: null,
      history: [],
      fallbackFetchedAt: 0,
      inflight: null,
    };
  }
  return host[MEMORY_KEY];
}

export function priceMode(): PriceMode {
  return process.env.PRICE_SOURCE === "quicknode" ? "quicknode" : "fallback";
}

function quickNodeMaxAgeMs(): number {
  const parsed = Number(process.env.QUICKNODE_MAX_AGE_MS);
  if (!Number.isFinite(parsed) || parsed < 1_000) return DEFAULT_QUICKNODE_MAX_AGE_MS;
  return parsed;
}

function asPositiveUsd(value: unknown): number | null {
  const price = typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;
  if (!Number.isFinite(price) || price < MIN_PRICE_USD || price > MAX_PRICE_USD) return null;
  return price;
}

/** Pyth price objects use an integer `price` plus a negative `expo`. */
function pythScaledPrice(value: unknown): number | null {
  if (!value || typeof value !== "object") return null;
  const price = value as { price?: unknown; expo?: unknown };
  if (typeof price.expo !== "number") return null;
  if (typeof price.price !== "string" && typeof price.price !== "number") return null;
  return asPositiveUsd(Number(price.price) * 10 ** price.expo);
}

/**
 * Reads a USD price from the public feeds we accept:
 * Coinbase `{ data: { amount } }`, CoinGecko `{ solana: { usd } }`,
 * Binance `{ price }`, a plain `{ price | priceUsd | solUsd }`, or a Pyth `parsed` update.
 */
export function extractUsdPrice(body: unknown): number | null {
  if (Array.isArray(body)) {
    for (let index = body.length - 1; index >= 0; index -= 1) {
      const price = extractUsdPrice(body[index]);
      if (price != null) return price;
    }
    return null;
  }
  if (!body || typeof body !== "object") return null;

  const record = body as Record<string, unknown>;
  const direct = asPositiveUsd(
    typeof record.price === "number" || typeof record.price === "string"
      ? record.price
      : (record.priceUsd ?? record.solUsd),
  );
  if (direct != null) return direct;

  const data = record.data;
  if (data && typeof data === "object" && "amount" in data) {
    const amount = asPositiveUsd((data as { amount: unknown }).amount);
    if (amount != null) return amount;
  }

  const scaled = pythScaledPrice(record.price);
  if (scaled != null) return scaled;

  if (Array.isArray(record.parsed)) {
    for (let index = record.parsed.length - 1; index >= 0; index -= 1) {
      const entry = record.parsed[index];
      if (entry && typeof entry === "object" && "price" in entry) {
        const pyth = pythScaledPrice((entry as { price: unknown }).price);
        if (pyth != null) return pyth;
      }
    }
  }

  for (const value of Object.values(record)) {
    if (!value || typeof value !== "object" || !("usd" in value)) continue;
    const usd = asPositiveUsd((value as { usd: unknown }).usd);
    if (usd != null) return usd;
  }

  return null;
}

async function fetchUsdPrice(url: string): Promise<number | null> {
  try {
    const response = await fetch(url, {
      cache: "no-store",
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!response.ok) return null;
    return extractUsdPrice(await response.json());
  } catch {
    return null;
  }
}

function isFreshQuickNode(observedAt: string, now: number): boolean {
  const age = now - Date.parse(observedAt);
  return Number.isFinite(age) && age <= quickNodeMaxAgeMs() && age > -5 * 60_000;
}

function remember(point: StoredPoint) {
  const store = memory();
  const now = Date.now();
  const keepStream =
    point.source === "fallback" &&
    store.latest?.source === "quicknode" &&
    isFreshQuickNode(store.latest.observedAt, now);

  if (!keepStream) store.latest = point;

  const previous = store.history[store.history.length - 1];
  if (
    previous &&
    previous.source === point.source &&
    previous.observedAt === point.observedAt &&
    previous.priceUsd === point.priceUsd
  ) {
    return;
  }
  store.history.push(point);
  if (store.history.length > HISTORY_LIMIT) {
    store.history.splice(0, store.history.length - HISTORY_LIMIT);
  }
}

async function refreshFallback(): Promise<StoredPoint | null> {
  const store = memory();
  if (store.inflight) return store.inflight;

  store.inflight = (async () => {
    const primary = process.env.FALLBACK_PRICE_URL?.trim() || DEFAULT_FALLBACK_URL;
    const backup = process.env.FALLBACK_PRICE_URL_BACKUP?.trim() || DEFAULT_BACKUP_URL;
    const priceUsd = (await fetchUsdPrice(primary)) ?? (await fetchUsdPrice(backup));
    if (priceUsd == null) return null;

    const point: StoredPoint = {
      priceUsd,
      source: "fallback",
      observedAt: new Date().toISOString(),
    };
    remember(point);
    memory().fallbackFetchedAt = Date.now();
    return point;
  })().finally(() => {
    memory().inflight = null;
  });

  return store.inflight;
}

function lastPoint(source: PriceSource): StoredPoint | null {
  const history = memory().history;
  for (let index = history.length - 1; index >= 0; index -= 1) {
    if (history[index]?.source === source) return history[index] ?? null;
  }
  return null;
}

function displayedPoint(mode: PriceMode, now: number): { point: StoredPoint | null; stale: boolean } {
  if (mode === "quicknode") {
    const stream = lastPoint("quicknode");
    if (stream && isFreshQuickNode(stream.observedAt, now)) {
      return { point: stream, stale: false };
    }
    return { point: lastPoint("fallback") ?? stream, stale: true };
  }

  const fallback = lastPoint("fallback");
  return { point: fallback, stale: fallback == null || !fallbackIsFresh(now) };
}

function snapshot(mode: PriceMode, now: number): PriceSnapshot {
  const { point, stale } = displayedPoint(mode, now);
  const history = memory()
    .history.filter((entry) => (mode === "fallback" ? entry.source === "fallback" : true))
    .map((entry) => ({ priceUsd: entry.priceUsd, observedAt: entry.observedAt }));

  if (!point) {
    return {
      ok: false,
      priceUsd: null,
      source: null,
      observedAt: null,
      stale: true,
      mode,
      history,
    };
  }

  return {
    ok: true,
    priceUsd: point.priceUsd,
    source: point.source,
    observedAt: point.observedAt,
    stale,
    mode,
    history,
  };
}

function fallbackIsFresh(now: number): boolean {
  const store = memory();
  return now - store.fallbackFetchedAt < FALLBACK_TTL_MS && lastPoint("fallback") != null;
}

/** Latest quote the arena should display. Fetches the public feed when the cache is stale. */
export async function getLatestPrice(): Promise<PriceSnapshot> {
  const mode = priceMode();
  const now = Date.now();
  const stream = mode === "quicknode" ? lastPoint("quicknode") : null;

  if (!(stream && isFreshQuickNode(stream.observedAt, now)) && !fallbackIsFresh(now)) {
    await refreshFallback();
  }

  return snapshot(mode, Date.now());
}

export type QuickNodePrice = {
  priceUsd: number;
  observedAt: string;
};

/** Stores a price delivered by the QuickNode webhook. */
export function recordQuickNodePrice(price: QuickNodePrice) {
  remember({
    priceUsd: price.priceUsd,
    source: "quicknode",
    observedAt: price.observedAt,
  });
}
