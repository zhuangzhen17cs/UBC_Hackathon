import { decide } from "@/lib/agents/decide";
import { listAgents } from "@/lib/agents/registry";
import { getCommentaryLine, narrate, onCommentary, resetCommentary } from "@/lib/engine/commentary";
import { detectEvents } from "@/lib/engine/events";
import { planMarketPayouts, resolveMarket } from "@/lib/engine/payouts";
import { lockNextSolContract, readContractResult, refreshContract, type GeminiLock } from "@/lib/market/gemini-pm";
import { MARKET_QUESTION } from "@/lib/market/question";
import { sendUsdc } from "@/lib/solana/betting";
import { sendMemo } from "@/lib/solana/memo";
import { getAgentKeypair, getEscrowKeypair, rawToUsdc, usdcToRaw } from "@/lib/solana/wallets";
import type {
  AgentDecision,
  MarketResult,
  MarketSide,
  ModelProvider,
  RoundBet,
  RoundCall,
  RoundPayout,
  RoundSnapshot,
} from "@/lib/types";

/**
 * One prediction market in this Node process.
 * Humans stake on agents during betting. Agents call YES, NO, or PASS during battle.
 * Gemini's published result settles the book. Payouts are devnet transfers.
 */

type Book = {
  id: string;
  name: string;
  color: string;
  provider: ModelProvider;
  custom: boolean;
  side: MarketSide;
  confidence: number;
  reason: string;
};

type LiveRound = {
  id: string;
  demo: boolean;
  phase: "betting" | "battle" | "settlement";
  phaseEndsAt: number;
  nextTickAt: number;
  tickMs: number;
  battleMs: number;
  question: string;
  openPrice: number | null;
  result: MarketResult | null;
  lastPrice: number | null;
  /** Gemini SOL contract locked at the start. Null only on a round created before this field. */
  contract: GeminiLock | null;
  /** How long to wait after expiry for Gemini to publish yes or no. */
  resolutionGraceMs: number;
  resolving: boolean;
  tickIndex: number;
  prices: number[];
  agents: Book[];
  calls: RoundCall[];
  bets: RoundBet[];
  payouts: RoundPayout[];
  payoutStarted: boolean;
};

type Engine = {
  round: LiveRound | null;
  timer: ReturnType<typeof setTimeout> | null;
  generation: number;
  ticking: boolean;
  listeners: Set<(round: RoundSnapshot | null) => void>;
};

const ENGINE_KEY = "__botRoyaleEngine";
const USED_KEY = "__botRoyaleUsedBets";
const CALL_MEMORY = 200;
const CALL_SNAPSHOT = 24;
const PRICE_MEMORY = 24;
const RESOLUTION_GRACE_MS = 90_000;
const CALLS_AFTER_BETTING_MS = 45_000;

function memory(): Engine {
  const host = globalThis as typeof globalThis & { [ENGINE_KEY]?: Engine };
  if (!host[ENGINE_KEY]) {
    host[ENGINE_KEY] = {
      round: null,
      timer: null,
      generation: 0,
      ticking: false,
      listeners: new Set(),
    };
  }
  return host[ENGINE_KEY];
}

function usedSignatures(): Set<string> {
  const host = globalThis as typeof globalThis & { [USED_KEY]?: Set<string> };
  if (!host[USED_KEY]) host[USED_KEY] = new Set();
  return host[USED_KEY];
}

/** Older in-memory rounds predate the market. Fill the gaps instead of crashing. */
function hydrate(round: LiveRound) {
  round.bets ??= [];
  round.payouts ??= [];
  round.calls ??= [];
  round.tickIndex ??= 0;
  round.contract ??= null;
  round.resolutionGraceMs ??= RESOLUTION_GRACE_MS;
  round.resolving ??= false;
  round.openPrice ??= null;
  round.result ??= null;
  round.question ??= MARKET_QUESTION;
  round.payoutStarted ??= false;
  round.prices ??= [];
  for (const agent of round.agents) {
    agent.side ??= "PASS";
    agent.confidence ??= 0;
    agent.reason ??= "";
    agent.provider ??= "grok";
    agent.custom ??= false;
  }
  for (const call of round.calls) {
    if (call.signature === undefined) call.signature = null;
  }
}

function readMs(name: string, fallback: number): number {
  const parsed = Number(process.env[name]);
  if (!Number.isFinite(parsed) || parsed < 1_000) return fallback;
  return parsed;
}

function clockFor(demo: boolean) {
  if (demo || process.env.DEMO_MODE === "true") {
    return {
      bettingMs: readMs("DEMO_BETTING_MS", 20_000),
      battleMs: readMs("DEMO_BATTLE_MS", 160_000),
      tickMs: readMs("DEMO_TICK_MS", 8_000),
    };
  }
  return {
    bettingMs: readMs("BETTING_MS", 120_000),
    battleMs: readMs("BATTLE_MS", 480_000),
    tickMs: readMs("TICK_MS", 15_000),
  };
}

function money(amount: number): number {
  return Math.round(amount * 100) / 100;
}

function stakeOf(round: LiveRound, agentId: string): number {
  return money(round.bets.filter((bet) => bet.agentId === agentId).reduce((sum, bet) => sum + bet.amount, 0));
}

function snapshotAgents(round: LiveRound): RoundSnapshot["agents"] {
  const rows = round.agents.map((agent) => ({
    id: agent.id,
    name: agent.name,
    color: agent.color,
    provider: agent.provider,
    custom: agent.custom,
    side: agent.side,
    confidence: agent.confidence,
    reason: agent.reason,
    stakeUsd: stakeOf(round, agent.id),
    rank: 1,
  }));
  rows.sort((a, b) => b.stakeUsd - a.stakeUsd || a.name.localeCompare(b.name));
  let rank = 1;
  rows.forEach((row, index) => {
    const previous = rows[index - 1];
    if (previous && previous.stakeUsd - row.stakeUsd > 0.009) rank = index + 1;
    row.rank = rank;
  });
  return rows;
}

function toSnapshot(round: LiveRound): RoundSnapshot {
  hydrate(round);
  if (round.phase === "settlement" && round.result == null && !round.contract) {
    round.result = resolveMarket(round.openPrice, round.lastPrice);
  }
  const agents = snapshotAgents(round);
  const result = round.result;
  const contract = round.contract;
  return {
    id: round.id,
    phase: round.phase,
    demo: round.demo,
    phaseEndsAt: new Date(round.phaseEndsAt).toISOString(),
    question: round.question,
    openPrice: contract?.strike ?? round.openPrice,
    priceUsd: contract?.yesPrice ?? round.lastPrice,
    contract: contract
      ? {
          eventTicker: contract.eventTicker,
          instrumentSymbol: contract.instrumentSymbol,
          outcome: contract.outcome,
          expiresAt: new Date(contract.expiresAtMs).toISOString(),
          yesPrice: contract.yesPrice,
          bid: contract.bid,
          ask: contract.ask,
          strike: contract.strike,
          awaitingResult: round.phase === "battle" && Date.now() >= contract.expiresAtMs,
        }
      : null,
    result,
    agents,
    calls: round.calls.slice(-CALL_SNAPSHOT).reverse(),
    priceHistory: round.prices.slice(-PRICE_MEMORY),
    bets: round.bets,
    payouts: round.payouts,
    commentary: getCommentaryLine(),
    winnerIds:
      result === "YES" || result === "NO"
        ? agents.filter((agent) => agent.side === result).map((agent) => agent.id)
        : [],
  };
}

export function getRoundSnapshot(): RoundSnapshot | null {
  const round = memory().round;
  return round ? toSnapshot(round) : null;
}

function publish() {
  const snapshot = getRoundSnapshot();
  for (const listener of memory().listeners) {
    try {
      listener(snapshot);
    } catch {
      // A disconnected stream should not stop the round.
    }
  }
}

export function subscribeRound(listener: (round: RoundSnapshot | null) => void): () => void {
  const engine = memory();
  engine.listeners.add(listener);
  return () => engine.listeners.delete(listener);
}

function arm(delayMs: number) {
  const engine = memory();
  const generation = engine.generation + 1;
  engine.generation = generation;
  if (engine.timer) clearTimeout(engine.timer);
  engine.timer = setTimeout(() => {
    const current = memory();
    if (current.generation !== generation) return;
    current.timer = null;
    void advance();
  }, Math.max(0, delayMs));
}

function beginBattle(round: LiveRound) {
  round.phase = "battle";
  round.phaseEndsAt = round.contract?.expiresAtMs ?? Date.now() + round.battleMs;
  round.nextTickAt = Date.now();
  publish();
  narrate({ type: "battle" });
  if (Date.now() >= round.phaseEndsAt) void enterSettlement(round);
}

function applySettlement(round: LiveRound, result: MarketResult) {
  if (round.phase === "settlement") return;
  round.phase = "settlement";
  round.result = result;
  round.resolving = false;
  const names = round.agents
    .filter((agent) => (result === "YES" || result === "NO" ? agent.side === result : false))
    .map((agent) => agent.name);
  publish();
  narrate({ type: "settlement", names, result });
  void settle(round);
}

async function publishedResult(round: LiveRound): Promise<MarketResult | null> {
  if (!round.contract) return resolveMarket(round.openPrice, round.lastPrice);
  return readContractResult(round.contract.eventTicker, round.contract.instrumentSymbol);
}

/** Settle from Gemini. If the result is not up yet, wait out the grace period, then refund. */
async function enterSettlement(round: LiveRound) {
  if (round.phase === "settlement" || round.resolving) return;
  round.resolving = true;
  let result: MarketResult | null = null;
  try {
    result = await publishedResult(round);
  } catch {
    result = null;
  }
  const phase = round.phase as LiveRound["phase"];
  if (memory().round !== round || phase === "settlement") {
    round.resolving = false;
    return;
  }
  const expiry = round.contract?.expiresAtMs ?? round.phaseEndsAt;
  const stillWaiting = result == null && Date.now() < expiry + round.resolutionGraceMs;
  if (stillWaiting) {
    round.resolving = false;
    round.phaseEndsAt = Date.now() + 5_000;
    publish();
    arm(5_000);
    return;
  }
  applySettlement(round, result ?? "PUSH");
}

async function settle(round: LiveRound) {
  hydrate(round);
  if (round.payoutStarted) return;
  round.payoutStarted = true;
  const plans = planMarketPayouts(
    round.bets.map((bet) => ({ wallet: bet.wallet, agentId: bet.agentId, raw: usdcToRaw(bet.amount) })),
    round.agents.map((agent) => ({ agentId: agent.id, side: agent.side })),
    round.result ?? "PUSH",
  );
  for (const plan of plans) {
    const amount = rawToUsdc(plan.raw);
    try {
      const signature = await sendUsdc(plan.wallet, plan.raw);
      round.payouts.push({ wallet: plan.wallet, amount, signature, kind: plan.kind });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Payout failed.";
      round.payouts.push({
        wallet: plan.wallet,
        amount,
        signature: null,
        kind: plan.kind,
        error: message.replace(/\s+/g, " ").slice(0, 160),
      });
    }
    if (memory().round === round) publish();
  }
}

function attachMemo(round: LiveRound, call: RoundCall) {
  const payer = getAgentKeypair(call.agentId) ?? getEscrowKeypair();
  if (!payer) return;
  const text = `COINRAID ${round.id.slice(0, 8)} ${call.agentName} ${call.side} @ ${call.priceUsd.toFixed(2)}`.slice(0, 180);
  void sendMemo(payer, text).then((signature) => {
    if (!signature || memory().round !== round) return;
    call.signature = signature;
    publish();
  });
}

async function refreshLockedContract(round: LiveRound): Promise<number | null> {
  if (!round.contract) return null;
  try {
    const fresh = await refreshContract(round.contract.eventTicker);
    round.contract = { ...round.contract, ...fresh, eventTicker: round.contract.eventTicker, instrumentSymbol: round.contract.instrumentSymbol };
    if (fresh.strike != null) round.openPrice = fresh.strike;
  } catch {
    // Keep the last quote. One quiet poll should not pass the whole desk.
  }
  return round.contract.yesPrice;
}

async function runTick(round: LiveRound) {
  const price = await refreshLockedContract(round);
  if (price == null || !(price > 0)) return;

  const tick = round.tickIndex;
  const before = round.agents.map((agent) => ({
    id: agent.id,
    name: agent.name,
    side: agent.side,
    confidence: agent.confidence,
  }));
  round.lastPrice = price;
  round.prices.push(price);
  if (round.prices.length > PRICE_MEMORY) {
    round.prices.splice(0, round.prices.length - PRICE_MEMORY);
  }

  const history = round.prices.slice(0, -1).map((priceUsd) => ({ priceUsd }));
  const timeoutMs = 20_000;
  const secondsLeft = round.contract ? Math.round((round.contract.expiresAtMs - Date.now()) / 1000) : 0;
  const decisions = await Promise.all(
    round.agents.map(async (agent) => {
      const decision: AgentDecision = await decide(
        agent.id,
        {
          question: round.question,
          openPrice: round.openPrice,
          priceUsd: price,
          history,
          contract: round.contract
            ? {
                outcome: round.contract.outcome,
                strike: round.contract.strike,
                bid: round.contract.bid,
                ask: round.contract.ask,
                secondsLeft,
              }
            : undefined,
        },
        { timeoutMs },
      );
      return { agent, decision };
    }),
  );

  if (memory().round !== round || round.phase !== "battle" || Date.now() >= round.phaseEndsAt) return;

  const at = new Date().toISOString();
  for (const { agent, decision } of decisions) {
    const changed = agent.side !== decision.side;
    agent.side = decision.side;
    agent.confidence = decision.confidence;
    agent.reason = decision.reason;
    if (!changed && tick !== 0) continue;
    const call: RoundCall = {
      id: crypto.randomUUID(),
      agentId: agent.id,
      agentName: agent.name,
      color: agent.color,
      side: decision.side,
      confidence: decision.confidence,
      priceUsd: price,
      reason: decision.reason,
      at,
      signature: null,
    };
    round.calls.push(call);
    attachMemo(round, call);
  }
  if (round.calls.length > CALL_MEMORY) {
    round.calls.splice(0, round.calls.length - CALL_MEMORY);
  }
  round.tickIndex = tick + 1;

  const after = round.agents.map((agent) => ({
    id: agent.id,
    name: agent.name,
    side: agent.side,
    confidence: agent.confidence,
  }));
  const event = detectEvents(before, after);
  if (event) narrate(event);
}

async function advance() {
  const engine = memory();
  const round = engine.round;
  if (!round || round.phase === "settlement") return;
  hydrate(round);

  if (round.phase === "betting") {
    if (Date.now() < round.phaseEndsAt) {
      arm(round.phaseEndsAt - Date.now());
      return;
    }
    beginBattle(round);
  }

  if (round.phase !== "battle") return;
  if (Date.now() >= round.phaseEndsAt) {
    await enterSettlement(round);
    return;
  }

  if (!engine.ticking && Date.now() >= round.nextTickAt) {
    engine.ticking = true;
    round.nextTickAt = Date.now() + round.tickMs;
    try {
      await runTick(round);
    } finally {
      engine.ticking = false;
    }
    if (memory().round === round && round.phase === "battle") publish();
  }

  if (memory().round !== round || round.phase !== "battle") return;
  if (Date.now() >= round.phaseEndsAt) {
    await enterSettlement(round);
    return;
  }
  arm(Math.min(round.nextTickAt, round.phaseEndsAt) - Date.now());
}

/** Wake a clock that lost its timer, for example after a dev-server reload. */
export async function ensureClock() {
  const engine = memory();
  if (!engine.round || engine.round.phase === "settlement") return;
  if (engine.timer || engine.ticking) return;
  await advance();
}

/** Close staking immediately and start the calls. The battle clock starts from now. */
export function openCalls(): { ok: true; round: RoundSnapshot } | { ok: false; error: string } {
  const round = memory().round;
  if (!round) return { ok: false, error: "No round is running." };
  hydrate(round);
  if (round.phase !== "betting") return { ok: false, error: "The calls have already started." };
  beginBattle(round);
  arm(0);
  return { ok: true, round: toSnapshot(round) };
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Settle from Gemini's published result. Near expiry, wait a few seconds,
 * because the result usually lands just after the clock.
 */
export async function finishRound(): Promise<{ ok: true; round: RoundSnapshot } | { ok: false; error: string }> {
  const round = memory().round;
  if (!round) return { ok: false, error: "No round is running." };
  hydrate(round);
  if (round.phase === "betting") return { ok: false, error: "Start the calls before settling." };
  if (round.phase === "settlement") return { ok: true, round: toSnapshot(round) };
  if (round.phase !== "battle") return { ok: false, error: "This round is already settled." };

  const expiry = round.contract?.expiresAtMs ?? 0;
  if (round.contract && Date.now() + 1_500 < expiry) {
    return { ok: false, error: "This contract is still open. It settles on its own a few seconds after the end time." };
  }

  const deadline = Date.now() + 20_000;
  let result: MarketResult | null = null;
  while (Date.now() <= deadline) {
    try {
      result = await publishedResult(round);
    } catch {
      result = null;
    }
    if (result != null || memory().round !== round || round.phase !== "battle") break;
    await wait(2_000);
  }

  if (memory().round !== round) return { ok: false, error: "That round already ended." };
  if (round.phase === "settlement") return { ok: true, round: toSnapshot(round) };
  if (result == null) {
    return { ok: false, error: "Gemini is still writing the result. This round will settle on its own." };
  }
  applySettlement(round, result);
  return { ok: true, round: toSnapshot(round) };
}

/**
 * Leave the round and return to the lobby.
 * A round that has not settled is a push: every stake is refunded first.
 */
export async function closeRound(): Promise<{ ok: true; round: RoundSnapshot | null } | { ok: false; error: string }> {
  const engine = memory();
  const round = engine.round;
  if (!round) return { ok: true, round: null };
  hydrate(round);
  if (engine.timer) clearTimeout(engine.timer);
  engine.timer = null;
  engine.generation += 1;

  if (round.phase !== "settlement") {
    round.phase = "settlement";
    round.result = "PUSH";
    round.resolving = false;
    publish();
    const idleUntil = Date.now() + 25_000;
    while (memory().ticking && Date.now() < idleUntil) await wait(200);
    await settle(round);
  }

  const failed = round.payouts.find((payout) => payout.error);
  if (failed) {
    if (memory().round === round) publish();
    return { ok: false, error: failed.error ?? "The refund did not land." };
  }

  if (memory().round === round) {
    engine.round = null;
    resetCommentary();
    publish();
  }
  return { ok: true, round: getRoundSnapshot() };
}

export async function startRound(
  demo: boolean,
): Promise<{ ok: true; round: RoundSnapshot } | { ok: false; error: string }> {
  const engine = memory();
  if (engine.round && engine.round.phase !== "settlement") {
    return { ok: false, error: "A round is already running." };
  }

  const clock = clockFor(demo);
  let locked: GeminiLock;
  try {
    locked = await lockNextSolContract(clock.bettingMs + CALLS_AFTER_BETTING_MS);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Gemini prediction markets did not answer.";
    return { ok: false, error: message };
  }
  if (engine.round && engine.round.phase !== "settlement") {
    return { ok: false, error: "A round is already running." };
  }

  const roster = listAgents();
  const round: LiveRound = {
    id: crypto.randomUUID(),
    demo: demo || process.env.DEMO_MODE === "true",
    phase: "betting",
    phaseEndsAt: Date.now() + clock.bettingMs,
    nextTickAt: 0,
    tickMs: clock.tickMs,
    battleMs: clock.battleMs,
    question: `${locked.title}. Will ${locked.outcome} finish YES?`,
    openPrice: locked.strike,
    result: null,
    lastPrice: locked.yesPrice,
    contract: locked,
    resolutionGraceMs: RESOLUTION_GRACE_MS,
    resolving: false,
    tickIndex: 0,
    prices: locked.yesPrice != null ? [locked.yesPrice] : [],
    agents: roster.map((agent) => ({
      id: agent.id,
      name: agent.name,
      color: agent.color,
      provider: agent.provider,
      custom: agent.custom,
      side: "PASS",
      confidence: 0,
      reason: "",
    })),
    calls: [],
    bets: [],
    payouts: [],
    payoutStarted: false,
  };

  engine.round = round;
  resetCommentary();
  publish();
  narrate({ type: "betting" });
  const escrow = getEscrowKeypair();
  if (escrow) void sendMemo(escrow, `COINRAID start ${round.id}`);
  arm(clock.bettingMs);
  return { ok: true, round: toSnapshot(round) };
}

export function placeBet(input: {
  roundId: string;
  wallet: string;
  agentId: string;
  amount: number;
  signature: string;
}): { ok: true; round: RoundSnapshot } | { ok: false; error: string } {
  const round = memory().round;
  if (!round) return { ok: false, error: "No round is running." };
  hydrate(round);
  if (round.id !== input.roundId) return { ok: false, error: "That bet is for a different round." };
  const used = usedSignatures();
  if (used.has(input.signature)) return { ok: false, error: "That transaction was already counted." };

  const sendBack = (reason: string) => {
    used.add(input.signature);
    const raw = usdcToRaw(input.amount);
    void sendUsdc(input.wallet, raw)
      .then((signature) => {
        if (memory().round !== round) return;
        round.payouts.push({ wallet: input.wallet, amount: input.amount, signature, kind: "refund" });
        publish();
      })
      .catch((error: unknown) => {
        if (memory().round !== round) return;
        const message = error instanceof Error ? error.message : "Refund failed.";
        round.payouts.push({
          wallet: input.wallet,
          amount: input.amount,
          signature: null,
          kind: "refund",
          error: message.replace(/\s+/g, " ").slice(0, 160),
        });
        publish();
      });
    return { ok: false as const, error: reason };
  };

  if (round.phase !== "betting") {
    return sendBack("Betting is closed. The stake is being sent back.");
  }

  if (!round.agents.some((agent) => agent.id === input.agentId)) {
    return sendBack("That agent is not in this round. The stake is being sent back.");
  }

  used.add(input.signature);
  round.bets.push({
    id: crypto.randomUUID(),
    wallet: input.wallet,
    agentId: input.agentId,
    amount: input.amount,
    signature: input.signature,
  });
  publish();
  return { ok: true, round: toSnapshot(round) };
}

onCommentary(() => publish());

queueMicrotask(() => {
  const engine = memory();
  engine.generation += 1;
  if (engine.timer) {
    clearTimeout(engine.timer);
    engine.timer = null;
  }
  if (engine.round && engine.round.phase !== "settlement") void advance();
});
