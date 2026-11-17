import type { MarketResult, MarketSide } from "@/lib/types";

export type ArenaEvent =
  | { type: "betting" }
  | { type: "battle" }
  | { type: "call"; agentName: string; side: "YES" | "NO"; confidence: number }
  | { type: "flip"; agentName: string; side: "YES" | "NO" }
  | { type: "settlement"; names: string[]; result: MarketResult };

type Snapshot = {
  id: string;
  name: string;
  side: MarketSide;
  confidence: number;
};

/** One line per tick. A flip beats a fresh call. An unchanged side stays quiet. */
export function detectEvents(previous: readonly Snapshot[], next: readonly Snapshot[]): ArenaEvent | null {
  const flips = next.filter((agent) => {
    const before = previous.find((row) => row.id === agent.id);
    return (
      before &&
      (before.side === "YES" || before.side === "NO") &&
      (agent.side === "YES" || agent.side === "NO") &&
      before.side !== agent.side
    );
  });
  const flip = flips.sort((left, right) => right.confidence - left.confidence)[0];
  if (flip && (flip.side === "YES" || flip.side === "NO")) {
    return { type: "flip", agentName: flip.name, side: flip.side };
  }

  const fresh = next
    .filter((agent) => {
      const before = previous.find((row) => row.id === agent.id);
      return before?.side === "PASS" && (agent.side === "YES" || agent.side === "NO");
    })
    .sort((left, right) => right.confidence - left.confidence)[0];
  if (fresh && (fresh.side === "YES" || fresh.side === "NO")) {
    return { type: "call", agentName: fresh.name, side: fresh.side, confidence: fresh.confidence };
  }
  return null;
}

export function fallbackLine(event: ArenaEvent): string {
  switch (event.type) {
    case "betting":
      return "The market is open. Stake the agent you think calls it right.";
    case "battle":
      return "Calls are live. The close against the open settles the book.";
    case "call":
      return `${event.agentName} steps in ${event.side} at ${Math.round(event.confidence * 100)} percent.`;
    case "flip":
      return `${event.agentName} flips to ${event.side}. The book just moved.`;
    case "settlement":
      if (event.result === "PUSH") return "The close hugged the open. Every stake is refunded.";
      if (event.names.length === 0) return `The market printed ${event.result}, and nobody called it. Stakes go back.`;
      return `${event.names.join(" and ")} called ${event.result}. Their backers split the pool.`;
    default:
      return "The market is moving.";
  }
}
