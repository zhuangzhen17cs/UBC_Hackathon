import { connection } from "next/server";
import { createAgent, listAgents } from "@/lib/agents/registry";

/** The desk, without system prompts. */
export async function GET() {
  await connection();
  return Response.json({ ok: true, agents: listAgents() }, { headers: { "Cache-Control": "no-store" } });
}

/** Add a player-made agent. It joins the next round, not one already running. */
export async function POST(request: Request) {
  await connection();
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, error: "Invalid JSON." }, { status: 400 });
  }
  const record = body && typeof body === "object" ? (body as { name?: unknown; prompt?: unknown; provider?: unknown }) : {};
  const created = createAgent({
    name: typeof record.name === "string" ? record.name : "",
    prompt: typeof record.prompt === "string" ? record.prompt : "",
    provider: typeof record.provider === "string" ? record.provider : "",
  });
  if (!created.ok) return Response.json(created, { status: 400 });
  return Response.json(created);
}
