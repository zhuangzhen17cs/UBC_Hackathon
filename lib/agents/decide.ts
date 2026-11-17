import { getAgent } from "@/lib/agents/registry";
import { callByProvider } from "@/lib/llm/provider";
import type { AgentDecision, MarketSide } from "@/lib/types";

/** What the agent can see when it calls the market. */
export type DecisionContext = {
  question: string;
  openPrice: number | null;
  priceUsd: number;
  history: readonly { priceUsd: number }[];
};

const DEFAULT_TIMEOUT_MS = 25_000;
const MAX_REASON_LENGTH = 180;
const SIDES: readonly MarketSide[] = ["YES", "NO", "PASS"];

const OUTPUT_RULES = [
  "Reply with JSON only, no markdown.",
  '{"side":"YES"|"NO"|"PASS","confidence":0 to 1,"reason":"one sentence"}',
  "YES means SOL finishes above the open. NO means it finishes below.",
  "PASS means you will not take a side. Use confidence 0.",
].join(" ");

function pass(reason: string, offline = false): AgentDecision {
  return {
    side: "PASS",
    confidence: 0,
    reason: reason.slice(0, MAX_REASON_LENGTH),
    ...(offline ? { offline: true } : {}),
  };
}

function timeoutMs(): number {
  const parsed = Number(process.env.XAI_TIMEOUT_MS);
  if (Number.isFinite(parsed) && parsed >= 1_000) return parsed;
  return DEFAULT_TIMEOUT_MS;
}

function marketBrief(context: DecisionContext): string {
  const prices = context.history.map((point) => point.priceUsd).filter((price) => Number.isFinite(price));
  const open = context.openPrice ?? prices[0] ?? context.priceUsd;
  const changePct = open > 0 ? ((context.priceUsd - open) / open) * 100 : 0;
  const recent = [...prices.slice(-4), context.priceUsd];
  return [
    `Market: ${context.question}`,
    `Open: $${open.toFixed(2)}. Latest: $${context.priceUsd.toFixed(2)} (${changePct >= 0 ? "+" : ""}${changePct.toFixed(2)}% vs open).`,
    `Recent prices: ${recent.map((price) => price.toFixed(2)).join(" → ")}.`,
  ].join("\n");
}

function extractJson(raw: string): unknown {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced?.[1]?.trim() || trimmed;
  try {
    return JSON.parse(candidate);
  } catch {
    const start = candidate.indexOf("{");
    const end = candidate.lastIndexOf("}");
    if (start === -1 || end <= start) throw new Error("not json");
    return JSON.parse(candidate.slice(start, end + 1));
  }
}

/** Invalid JSON or a bad side becomes PASS. Confidence is clamped to 0–1. */
export function parseAgentDecision(raw: string): AgentDecision {
  let value: unknown;
  try {
    value = extractJson(raw);
  } catch {
    return pass("Call was not valid JSON. Passing.", true);
  }
  if (!value || typeof value !== "object") return pass("Call was not valid JSON. Passing.", true);

  const record = value as Record<string, unknown>;
  const side = typeof record.side === "string" ? record.side.toUpperCase() : "";
  if (!SIDES.includes(side as MarketSide)) return pass("Call had no YES, NO, or PASS. Passing.", true);

  const reason = typeof record.reason === "string" ? record.reason.replace(/\s+/g, " ").trim() : "";
  if (!reason) return pass("Call had no reason. Passing.", true);
  if (side === "PASS") return pass(reason);

  const confidence = typeof record.confidence === "number" ? record.confidence : Number(record.confidence);
  const clamped = Number.isFinite(confidence) ? Math.min(1, Math.max(0, confidence)) : 0.5;
  return {
    side: side as MarketSide,
    confidence: Math.round(clamped * 100) / 100,
    reason: reason.slice(0, MAX_REASON_LENGTH),
  };
}

/** One agent, one tick. The agent's provider is the one chosen when it was created. */
export async function decide(
  agentId: string,
  context: DecisionContext,
  overrides?: { timeoutMs?: number },
): Promise<AgentDecision> {
  if (!Number.isFinite(context.priceUsd) || context.priceUsd <= 0) {
    return pass("No usable SOL price. Passing.", true);
  }
  const agent = getAgent(agentId);
  if (!agent) return pass("This agent is not on the desk. Passing.", true);

  const requested = overrides?.timeoutMs;
  const options = {
    timeoutMs:
      typeof requested === "number" && Number.isFinite(requested) && requested >= 1_000
        ? requested
        : timeoutMs(),
    temperature: agent.temperature,
  };
  const messages = [
    { role: "system" as const, content: `${agent.prompt} ${OUTPUT_RULES}` },
    { role: "user" as const, content: marketBrief(context) },
  ];

  try {
    const raw = await callByProvider(agent.provider, { messages, ...options });
    return parseAgentDecision(raw);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Call failed. Passing.";
    return pass(cleanFailure(message), true);
  }
}

/** Keep provider error bodies off the board. */
function cleanFailure(message: string): string {
  if (/api key/i.test(message)) return "The model rejected the API key. Passing.";
  if (/timed out/i.test(message)) return "The model timed out. Passing.";
  const missing = message.match(/No ([A-Z0-9_]*API_KEY)/);
  if (missing) return `No ${missing[1]} set. Passing.`;
  const text = message.replace(/\{[\s\S]*\}/g, "").replace(/\s+/g, " ").trim();
  return (text || "Call failed. Passing.").slice(0, 140);
}
