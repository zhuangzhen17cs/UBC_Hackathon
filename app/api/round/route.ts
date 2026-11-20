import { connection } from "next/server";
import { closeRound, ensureClock, finishRound, getRoundSnapshot, openCalls, startRound } from "@/lib/engine/round";

/** Current round. `round` is null in the lobby. */
export async function GET() {
  await connection();
  await ensureClock();
  return Response.json(
    { ok: true, round: getRoundSnapshot() },
    { headers: { "Cache-Control": "no-store" } },
  );
}

/** Start a round. `{ "demo": true }` uses the short clock from .env.example. */
export async function POST(request: Request) {
  await connection();
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, error: "Invalid JSON." }, { status: 400 });
  }

  const record = body && typeof body === "object" ? (body as { action?: unknown; demo?: unknown }) : {};
  const action = record.action;
  const result =
    action === "start"
      ? await startRound(record.demo === true)
      : action === "open"
        ? openCalls()
        : action === "finish"
          ? await finishRound()
          : action === "close"
            ? await closeRound()
            : null;
  if (!result) {
    return Response.json({ ok: false, error: 'Send { "action": "start" | "open" | "finish" | "close" }.' }, { status: 400 });
  }
  if (!result.ok) return Response.json(result, { status: 409 });
  return Response.json(result);
}
