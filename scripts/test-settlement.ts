import assert from "node:assert/strict";
import { demoPrice, scriptedDecision } from "@/lib/engine/drama";
import { detectEvents } from "@/lib/engine/events";
import { planMarketPayouts, quoteMarket, resolveMarket } from "@/lib/engine/payouts";
import { resolutionToResult } from "@/lib/market/gemini-pm";
import { assertDevnetRpc } from "@/lib/solana/cluster";

const raw = (usdc: number) => BigInt(usdc) * 1_000_000n;

// Three people back agent A for 50, 25, and 25. The other side stakes 100.
// A profits 100. The 50 stake is half the book and receives half the profit, plus the stake back.
const example = planMarketPayouts(
  [
    { wallet: "me", agentId: "a", raw: raw(50) },
    { wallet: "left", agentId: "a", raw: raw(25) },
    { wallet: "right", agentId: "a", raw: raw(25) },
    { wallet: "other", agentId: "b", raw: raw(100) },
  ],
  [
    { agentId: "a", side: "YES" },
    { agentId: "b", side: "NO" },
  ],
  "YES",
);
const mine = example.find((plan) => plan.wallet === "me");
assert.equal(mine?.raw, raw(100));
assert.equal(mine?.kind, "payout");
assert.equal(example.find((plan) => plan.wallet === "left")?.raw, raw(50));
assert.equal(example.find((plan) => plan.wallet === "right")?.raw, raw(50));
assert.equal(example.some((plan) => plan.wallet === "other"), false);
assert.equal(
  example.reduce((sum, plan) => sum + plan.raw, 0n),
  raw(200),
);

const quoted = quoteMarket(
  [
    { agentId: "a", amount: 50 },
    { agentId: "a", amount: 25 },
    { agentId: "a", amount: 25 },
    { agentId: "b", amount: 100 },
  ],
  [
    { agentId: "a", side: "YES" },
    { agentId: "b", side: "NO" },
  ],
);
assert.equal(quoted.pool, 200);
assert.equal(quoted.quotes.find((quote) => quote.agentId === "a")?.stake, 100);
assert.equal(quoted.quotes.find((quote) => quote.agentId === "a")?.profitIfSideWins, 100);

const push = planMarketPayouts(
  [
    { wallet: "me", agentId: "a", raw: raw(50) },
    { wallet: "other", agentId: "b", raw: raw(25) },
  ],
  [
    { agentId: "a", side: "YES" },
    { agentId: "b", side: "NO" },
  ],
  "PUSH",
);
assert.ok(push.every((plan) => plan.kind === "refund"));
assert.equal(
  push.reduce((sum, plan) => sum + plan.raw, 0n),
  raw(75),
);

const passed = planMarketPayouts(
  [
    { wallet: "sitter", agentId: "a", raw: raw(10) },
    { wallet: "winner", agentId: "b", raw: raw(10) },
    { wallet: "loser", agentId: "c", raw: raw(30) },
  ],
  [
    { agentId: "a", side: "PASS" },
    { agentId: "b", side: "YES" },
    { agentId: "c", side: "NO" },
  ],
  "YES",
);
assert.equal(passed.find((plan) => plan.wallet === "sitter")?.kind, "refund");
assert.equal(passed.find((plan) => plan.wallet === "sitter")?.raw, raw(10));
assert.equal(passed.find((plan) => plan.wallet === "winner")?.raw, raw(40));

const nobody = planMarketPayouts(
  [{ wallet: "only", agentId: "a", raw: raw(12) }],
  [{ agentId: "a", side: "NO" }],
  "YES",
);
assert.equal(nobody[0]?.kind, "refund");
assert.equal(nobody[0]?.raw, raw(12));

const dust = planMarketPayouts(
  [
    { wallet: "A", agentId: "yes", raw: 1n },
    { wallet: "B", agentId: "yes", raw: 1n },
    { wallet: "C", agentId: "yes", raw: 1n },
    { wallet: "D", agentId: "no", raw: 1n },
  ],
  [
    { agentId: "yes", side: "YES" },
    { agentId: "no", side: "NO" },
  ],
  "YES",
);
assert.equal(
  dust.reduce((sum, plan) => sum + plan.raw, 0n),
  4n,
);

assert.equal(resolutionToResult("yes"), "YES");
assert.equal(resolutionToResult("NO"), "NO");
assert.equal(resolutionToResult("void"), "PUSH");
assert.equal(resolutionToResult(null), null);

assert.equal(resolveMarket(100, 101), "YES");
assert.equal(resolveMarket(100, 99), "NO");
assert.equal(resolveMarket(100, 100), "PUSH");
assert.equal(resolveMarket(null, 100), "PUSH");

const flip = detectEvents(
  [{ id: "degen", name: "Degen", side: "YES", confidence: 0.8 }],
  [{ id: "degen", name: "Degen", side: "NO", confidence: 0.7 }],
);
assert.equal(flip?.type, "flip");

assert.ok(demoPrice(100, 7) < 50);
assert.equal(scriptedDecision("degen", 0)?.side, "YES");
assert.equal(scriptedDecision("degen", 40)?.side, "YES");
assert.equal(scriptedDecision("custom-agent", 0), null);

assert.throws(() => assertDevnetRpc("https://api.mainnet-beta.solana.com"));
assert.doesNotThrow(() => assertDevnetRpc("https://api.devnet.solana.com"));

console.log("settlement checks passed");
