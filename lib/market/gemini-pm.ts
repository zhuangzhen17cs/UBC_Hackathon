import type { MarketResult } from "@/lib/types";

const EVENTS_URL = "https://api.gemini.com/v1/prediction-markets/events";

/** One Gemini SOL Up contract, locked for the life of a round. */
export type GeminiLock = {
  eventTicker: string;
  instrumentSymbol: string;
  title: string;
  outcome: string;
  expiresAtMs: number;
  yesPrice: number | null;
  bid: number | null;
  ask: number | null;
  strike: number | null;
};

type Listed = {
  ticker: string;
  expiresAtMs: number;
};

/** Gemini publishes `yes` or `no` on the Up contract. Anything else is not a result yet. */
export function resolutionToResult(side: unknown): MarketResult | null {
  if (typeof side !== "string") return null;
  const value = side.trim().toLowerCase();
  if (value === "yes") return "YES";
  if (value === "no") return "NO";
  if (value === "void" || value === "push" || value === "cancel" || value === "cancelled") return "PUSH";
  return null;
}

/**
 * Soonest SOL 5-minute Up contract that still has `minLeadMs` left.
 * Public market data. No Gemini account and no order.
 */
export async function lockNextSolContract(minLeadMs: number): Promise<GeminiLock> {
  const listed = await listSolFiveMinute(Date.now() + minLeadMs);
  const next = listed[0];
  if (!next) {
    throw new Error("No SOL 5-minute contract on Gemini lasts long enough for this round.");
  }
  return loadContract(next.ticker);
}

/** Fresh Yes price, bid, ask, and strike for a contract this round already locked. */
export async function refreshContract(ticker: string): Promise<GeminiLock> {
  return loadContract(ticker);
}

/** The published result, or null while Gemini is still quiet. */
export async function readContractResult(ticker: string, instrumentSymbol: string): Promise<MarketResult | null> {
  const event = await getEvent(ticker);
  const contract = contractsOf(event).find((row) => text(row.instrumentSymbol) === instrumentSymbol);
  if (!contract) return null;
  return resolutionToResult(contract.resolutionSide);
}

async function listSolFiveMinute(earliestExpiryMs: number): Promise<Listed[]> {
  const url = `${EVENTS_URL}?${new URLSearchParams({
    status: "active",
    category: "Crypto",
    limit: "100",
  }).toString()}`;
  const body = await getJson(url);
  const rows = Array.isArray(body.data) ? body.data : [];
  const listed: Listed[] = [];
  for (const row of rows) {
    const event = asRecord(row);
    if (!event) continue;
    const ticker = text(event.ticker);
    const expiresAtMs = Date.parse(text(event.expiryDate));
    if (!ticker.startsWith("SOL05M") || !Number.isFinite(expiresAtMs)) continue;
    if (expiresAtMs <= earliestExpiryMs) continue;
    const up = contractsOf(event).find((contract) => isUp(contract));
    if (!up || text(up.marketState).toLowerCase() === "closed") continue;
    listed.push({ ticker, expiresAtMs });
  }
  listed.sort((left, right) => left.expiresAtMs - right.expiresAtMs);
  return listed;
}

async function loadContract(ticker: string): Promise<GeminiLock> {
  const event = await getEvent(ticker);
  const title = text(event.title);
  const expiresAtMs = Date.parse(text(event.expiryDate));
  const contract = contractsOf(event).find((row) => isUp(row));
  const instrumentSymbol = text(contract?.instrumentSymbol);
  if (!title || !instrumentSymbol || !Number.isFinite(expiresAtMs)) {
    throw new Error("Gemini returned a SOL contract without a title or expiry.");
  }
  const prices = asRecord(contract?.prices);
  const bid = numberOrNull(prices?.bestBid);
  const ask = numberOrNull(prices?.bestAsk);
  const last = numberOrNull(prices?.lastTradePrice);
  const yesPrice = last ?? (bid != null && ask != null ? Math.round(((bid + ask) / 2) * 100) / 100 : numberOrNull(asRecord(prices?.buy)?.yes));
  const strikeRecord = asRecord(contract?.strike);
  return {
    eventTicker: ticker,
    instrumentSymbol,
    title,
    outcome: text(contract?.label) || "Up",
    expiresAtMs,
    yesPrice,
    bid,
    ask,
    strike: numberOrNull(strikeRecord?.value),
  };
}

async function getEvent(ticker: string): Promise<Record<string, unknown>> {
  const body = await getJson(`${EVENTS_URL}/${encodeURIComponent(ticker)}`);
  const wrapped = asRecord(body.data);
  const event = wrapped ?? body;
  if (!text(event.ticker) && !text(event.title)) {
    throw new Error("Gemini returned an empty event.");
  }
  return event;
}

async function getJson(url: string): Promise<Record<string, unknown>> {
  let response: Response;
  try {
    response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(8_000) });
  } catch {
    throw new Error("Gemini prediction markets did not answer.");
  }
  if (!response.ok) throw new Error(`Gemini prediction markets returned ${response.status}.`);
  const body: unknown = await response.json();
  const record = asRecord(body);
  if (!record) throw new Error("Gemini prediction markets returned an unexpected payload.");
  return record;
}

function contractsOf(event: Record<string, unknown>): Record<string, unknown>[] {
  const contracts = event.contracts;
  if (!Array.isArray(contracts)) return [];
  return contracts.map(asRecord).filter((row): row is Record<string, unknown> => row != null);
}

function isUp(contract: Record<string, unknown>): boolean {
  const label = text(contract.label).toLowerCase();
  const symbol = text(contract.instrumentSymbol).toUpperCase();
  return label === "up" || symbol.endsWith("-UP");
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function numberOrNull(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : null;
}
