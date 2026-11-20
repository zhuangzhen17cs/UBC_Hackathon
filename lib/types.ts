/** Shared contracts for agents, prices, and the live round. */

/** Built-in ids are fixed. A player-made agent gets its own slug. */
export type AgentId = string;

export type ModelProvider = "grok" | "gemini" | "openai" | "anthropic";

/** What the lobby can show. The system prompt stays on the server. */
export type PublicAgent = {
  id: string;
  name: string;
  tagline: string;
  color: string;
  provider: ModelProvider;
  custom: boolean;
};

export type MarketSide = "YES" | "NO" | "PASS";

export type MarketResult = "YES" | "NO" | "PUSH";

/** Strict JSON every agent must return. A bad reply becomes PASS. */
export type AgentDecision = {
  side: MarketSide;
  /** 0 to 1. PASS is always 0. */
  confidence: number;
  reason: string;
  /** The model never answered. A short round may play a scripted card instead. */
  offline?: boolean;
};

export type PriceSource = "quicknode" | "fallback";

export type PriceMode = "quicknode" | "fallback";

export type PricePoint = {
  priceUsd: number;
  observedAt: string;
};

/** What GET /api/price returns and what the arena renders. */
export type PriceSnapshot = {
  ok: boolean;
  priceUsd: number | null;
  source: PriceSource | null;
  observedAt: string | null;
  /** True when this quote is a stand-in for a missing or quiet feed. */
  stale: boolean;
  /** Which feed the server prefers. A quiet QuickNode stream still reports mode "quicknode". */
  mode: PriceMode;
  history: PricePoint[];
};

export type RoundPhase = "betting" | "battle" | "settlement";

export type RoundAgentState = {
  id: AgentId;
  name: string;
  color: string;
  provider: ModelProvider;
  custom: boolean;
  side: MarketSide;
  confidence: number;
  reason: string;
  /** Devnet USDC humans have staked on this agent. */
  stakeUsd: number;
  rank: number;
};

export type RoundCall = {
  id: string;
  agentId: AgentId;
  agentName: string;
  color: string;
  side: MarketSide;
  confidence: number;
  priceUsd: number;
  reason: string;
  at: string;
  /** Devnet memo. Null when the fee payer has no SOL. */
  signature: string | null;
};

export type RoundBet = {
  id: string;
  wallet: string;
  agentId: AgentId;
  /** USDC, 2 decimal display value of the raw token amount. */
  amount: number;
  signature: string;
};

export type RoundPayout = {
  wallet: string;
  amount: number;
  signature: string | null;
  kind: "payout" | "refund";
  error?: string;
};

export type CommentaryLine = {
  id: string;
  text: string;
  hasAudio: boolean;
  at: string;
};

/** The Gemini SOL contract this round is locked to. */
export type RoundContract = {
  eventTicker: string;
  instrumentSymbol: string;
  outcome: string;
  expiresAt: string;
  yesPrice: number | null;
  bid: number | null;
  ask: number | null;
  strike: number | null;
  /** True after expiry, while Gemini has not published yes or no. */
  awaitingResult: boolean;
};

/** Public round view. Lobby is `null` — no round has been started. */
export type RoundSnapshot = {
  id: string;
  phase: RoundPhase;
  demo: boolean;
  phaseEndsAt: string;
  /** The binary question for this round. */
  question: string;
  /** Strike captured by Gemini, once the observation window has opened. */
  openPrice: number | null;
  /** Latest Yes price of the locked contract. */
  priceUsd: number | null;
  contract: RoundContract | null;
  result: MarketResult | null;
  agents: RoundAgentState[];
  /** Newest calls first. */
  calls: RoundCall[];
  /** Prices used this round, oldest first. A short round is a scripted tape. */
  priceHistory: number[];
  bets: RoundBet[];
  payouts: RoundPayout[];
  commentary: CommentaryLine | null;
  /** Agents whose side matched the result. Empty on a push. */
  winnerIds: AgentId[];
};

export type RoundStreamEvent = {
  type: "round";
  round: RoundSnapshot | null;
};
