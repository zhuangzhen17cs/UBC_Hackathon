import type { AgentDecision, MarketSide } from "@/lib/types";

/**
 * A short round replays this path so the show has a rally, a crash, and a finish above the open.
 * Multipliers are against the price captured on the first tick.
 */
const TAPE = [
  1, 1.04, 1.1, 1.18, 1.12, 0.9, 0.62, 0.48, 0.58, 0.75, 0.95, 1.1, 1.22, 1.15, 1.28, 1.2, 1.24, 1.18, 1.26, 1.22,
] as const;

type Cue = { side: MarketSide; confidence: number; reason: string };

/** Used only when the model is offline, and only for the four default agents. */
const CUES: Record<string, readonly Cue[]> = {
  degen: [
    { side: "YES", confidence: 0.9, reason: "Tape is green. We are not passing." },
    { side: "YES", confidence: 0.8, reason: "Still above the open. Holding the call." },
    { side: "NO", confidence: 0.7, reason: "It broke the open. Flipping." },
    { side: "YES", confidence: 0.85, reason: "Reclaimed the open. Back to YES." },
  ],
  grandma: [
    { side: "PASS", confidence: 0, reason: "Too early. Sitting this one out." },
    { side: "PASS", confidence: 0, reason: "Still no edge. Passing." },
    { side: "NO", confidence: 0.4, reason: "It is well under the open. A small NO." },
    { side: "PASS", confidence: 0, reason: "It came back. I am out." },
  ],
  contrarian: [
    { side: "NO", confidence: 0.7, reason: "Straight up from the open. Fading it." },
    { side: "NO", confidence: 0.6, reason: "Still too clean. Staying NO." },
    { side: "YES", confidence: 0.75, reason: "Everyone is scared under the open. Buying the other side." },
    { side: "NO", confidence: 0.55, reason: "It overshot. Fading the bounce." },
  ],
  grok: [
    { side: "YES", confidence: 0.6, reason: "First print is above the open. Lean YES." },
    { side: "YES", confidence: 0.7, reason: "Path is still above the level." },
    { side: "NO", confidence: 0.8, reason: "Lost the open on range. Flipping to NO." },
    { side: "YES", confidence: 0.72, reason: "Reclaimed and held. Back to YES." },
  ],
};

export function demoPrice(anchor: number, tick: number): number {
  const index = Math.min(Math.max(0, tick), TAPE.length - 1);
  return Math.round(anchor * TAPE[index] * 100) / 100;
}

export function scriptedDecision(agentId: string, tick: number): AgentDecision | null {
  const cues = CUES[agentId];
  if (!cues) return null;
  const cue = cues[Math.min(tick, cues.length - 1)];
  if (!cue) return null;
  return { side: cue.side, confidence: cue.confidence, reason: cue.reason };
}
