/**
 * Checks the call parser, then asks each default agent once.
 * From the repo root: npm run test:agents
 *
 * A missing provider key becomes PASS. The parser checks below do not need a key.
 */
import assert from "node:assert/strict";
import { decide, parseAgentDecision, type DecisionContext } from "../lib/agents/decide";
import { AGENTS } from "../lib/agents/personalities";
import { loadLocalEnv } from "../lib/env";

loadLocalEnv();

const context: DecisionContext = {
  question: "Will SOL finish above the open price?",
  openPrice: 68.2,
  priceUsd: 73.5,
  history: [
    { priceUsd: 68.2 },
    { priceUsd: 70.4 },
    { priceUsd: 71.9 },
    { priceUsd: 73.1 },
  ],
};

const invalid = parseAgentDecision("not json");
assert.equal(invalid.side, "PASS");
assert.equal(invalid.offline, true);

const yes = parseAgentDecision('{"side":"yes","confidence":4,"reason":"It cleared the open."}');
assert.equal(yes.side, "YES");
assert.equal(yes.confidence, 1);

const sitting = parseAgentDecision('{"side":"PASS","confidence":0.9,"reason":"Too close to the open."}');
assert.equal(sitting.side, "PASS");
assert.equal(sitting.confidence, 0);

async function main() {
  console.log("COINRAID agent test");
  console.log(`XAI_API_KEY: ${process.env.XAI_API_KEY?.trim() ? "set" : "missing"}`);
  console.log(`GEMINI_API_KEY: ${process.env.GEMINI_API_KEY?.trim() ? "set" : "missing"}`);
  console.log(`OPENAI_API_KEY: ${process.env.OPENAI_API_KEY?.trim() ? "set" : "missing"}`);
  console.log(`ANTHROPIC_API_KEY: ${process.env.ANTHROPIC_API_KEY?.trim() ? "set" : "missing"}`);

  const decisions = await Promise.all(
    AGENTS.map(async (agent) => ({
      name: agent.name,
      provider: agent.provider,
      decision: await decide(agent.id, context),
    })),
  );

  for (const result of decisions) {
    console.log(`\n${result.name} (${result.provider})`);
    console.log(JSON.stringify(result.decision, null, 2));
    assert.ok(["YES", "NO", "PASS"].includes(result.decision.side));
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Agent test failed.";
  console.error(message);
  process.exitCode = 1;
});
