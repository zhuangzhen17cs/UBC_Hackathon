import { connection } from "next/server";
import { ensureClock, getRoundSnapshot, subscribeRound } from "@/lib/engine/round";
import type { RoundSnapshot } from "@/lib/types";

/**
 * Server-Sent Events for the open round.
 * Each message is `data: {"type":"round","round": ...}`.
 * Lobby sends `"round": null`.
 */
export async function GET(request: Request) {
  await connection();
  const encoder = new TextEncoder();
  let unsubscribe = () => {};
  let heartbeat: ReturnType<typeof setInterval> | null = null;

  const stream = new ReadableStream({
    start(controller) {
      const send = (round: RoundSnapshot | null) => {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ type: "round", round })}\n\n`),
        );
      };

      const cleanup = () => {
        if (heartbeat) clearInterval(heartbeat);
        heartbeat = null;
        unsubscribe();
        unsubscribe = () => {};
      };

      unsubscribe = subscribeRound((round) => {
        try {
          send(round);
        } catch {
          cleanup();
        }
      });

      try {
        send(getRoundSnapshot());
      } catch {
        cleanup();
        return;
      }

      void ensureClock().catch(() => {
        cleanup();
      });

      heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(`: ping\n\n`));
        } catch {
          cleanup();
        }
      }, 15_000);

      request.signal.addEventListener("abort", cleanup, { once: true });
    },
    cancel() {
      if (heartbeat) clearInterval(heartbeat);
      unsubscribe();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
