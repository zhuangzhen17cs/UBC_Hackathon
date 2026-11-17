import type { MarketResult, MarketSide } from "@/lib/types";

export type Stake = {
  wallet: string;
  agentId: string;
  /** Token base units. */
  raw: bigint;
};

export type PayoutPlan = {
  wallet: string;
  raw: bigint;
  kind: "payout" | "refund";
};

export type AgentCall = {
  agentId: string;
  side: MarketSide;
};

/**
 * Backers of a correct agent split the whole active pool by their stake.
 * That payment is their stake back plus their share of the agent's profit.
 * A wrong side loses the stake. PASS stakes are refunded.
 * If nobody called the winning side, or the market is a push, everyone is refunded.
 * House fee is 0.
 */
export function planMarketPayouts(
  stakes: readonly Stake[],
  calls: readonly AgentCall[],
  result: MarketResult,
): PayoutPlan[] {
  if (stakes.length === 0) return [];
  const sideOf = new Map(calls.map((call) => [call.agentId, call.side]));
  if (result === "PUSH") return group(stakes, "refund");

  const refunds: Stake[] = [];
  const active: Stake[] = [];
  for (const stake of stakes) {
    const side = sideOf.get(stake.agentId) ?? "PASS";
    if (side === "PASS") refunds.push(stake);
    else active.push(stake);
  }

  const winning = active.filter((stake) => sideOf.get(stake.agentId) === result);
  const winningRaw = sum(winning);
  if (winningRaw <= 0n) return group([...refunds, ...active], "refund");

  const activeRaw = sum(active);
  const byWallet = new Map<string, bigint>();
  for (const stake of winning) {
    byWallet.set(stake.wallet, (byWallet.get(stake.wallet) ?? 0n) + stake.raw);
  }

  const entries = [...byWallet.entries()];
  let allocated = 0n;
  const payouts: PayoutPlan[] = entries.map(([wallet, stake]) => {
    const raw = (activeRaw * stake) / winningRaw;
    allocated += raw;
    return { wallet, raw, kind: "payout" as const };
  });
  const dust = activeRaw - allocated;
  const last = payouts[payouts.length - 1];
  if (dust > 0n && last) last.raw += dust;

  return [...payouts.filter((plan) => plan.raw > 0n), ...group(refunds, "refund")];
}

/** YES if the close is clearly above the open, NO if clearly below, otherwise a push. */
export function resolveMarket(openPrice: number | null, finalPrice: number | null): MarketResult {
  if (openPrice == null || finalPrice == null || !(openPrice > 0) || !(finalPrice > 0)) return "PUSH";
  const band = openPrice * 0.0005;
  if (finalPrice > openPrice + band) return "YES";
  if (finalPrice < openPrice - band) return "NO";
  return "PUSH";
}

export type MarketQuote = {
  agentId: string;
  side: MarketSide;
  stake: number;
  /** Profit this agent's backers split if their side hits. Null when the agent passed. */
  profitIfSideWins: number | null;
};

/** Preview the split before settlement. Profit is the other side's money. */
export function quoteMarket(
  bets: readonly { agentId: string; amount: number }[],
  calls: readonly { agentId: string; side: MarketSide }[],
): { pool: number; quotes: MarketQuote[] } {
  const pool = roundCents(bets.reduce((sum, bet) => sum + bet.amount, 0));
  const quotes = calls.map((call) => {
    const stake = roundCents(bets.filter((bet) => bet.agentId === call.agentId).reduce((sum, bet) => sum + bet.amount, 0));
    const sameSide = calls
      .filter((other) => other.side === call.side && call.side !== "PASS")
      .reduce((sum, other) => {
        return sum + bets.filter((bet) => bet.agentId === other.agentId).reduce((inner, bet) => inner + bet.amount, 0);
      }, 0);
    const opposite = calls
      .filter((other) => other.side !== "PASS" && other.side !== call.side)
      .reduce((sum, other) => {
        return sum + bets.filter((bet) => bet.agentId === other.agentId).reduce((inner, bet) => inner + bet.amount, 0);
      }, 0);
    const profit = call.side !== "PASS" && sameSide > 0 ? roundCents(opposite * (stake / sameSide)) : null;
    return {
      agentId: call.agentId,
      side: call.side,
      stake,
      profitIfSideWins: profit,
    };
  });
  return { pool: roundCents(pool), quotes };
}

function sum(stakes: readonly Stake[]): bigint {
  return stakes.reduce((total, stake) => total + stake.raw, 0n);
}

function group(stakes: readonly Stake[], kind: PayoutPlan["kind"]): PayoutPlan[] {
  const byWallet = new Map<string, bigint>();
  for (const stake of stakes) byWallet.set(stake.wallet, (byWallet.get(stake.wallet) ?? 0n) + stake.raw);
  return [...byWallet.entries()]
    .filter(([, raw]) => raw > 0n)
    .map(([wallet, raw]) => ({ wallet, raw, kind }));
}

function roundCents(amount: number): number {
  return Math.round(amount * 100) / 100;
}
