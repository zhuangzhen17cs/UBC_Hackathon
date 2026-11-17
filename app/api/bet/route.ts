import { connection } from "next/server";
import { placeBet } from "@/lib/engine/round";
import { verifyDeposit } from "@/lib/solana/betting";
import { getRoundSnapshot } from "@/lib/engine/round";

/** Current bets and payouts for the live round. */
export async function GET() {
  await connection();
  const round = getRoundSnapshot();
  return Response.json(
    { ok: true, bets: round?.bets ?? [], payouts: round?.payouts ?? [] },
    { headers: { "Cache-Control": "no-store" } },
  );
}

/** Count a confirmed devnet USDC transfer to escrow as a bet. */
export async function POST(request: Request) {
  await connection();
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, error: "Invalid JSON." }, { status: 400 });
  }
  const record = body && typeof body === "object" ? (body as { signature?: unknown; roundId?: unknown }) : {};
  const signature = typeof record.signature === "string" ? record.signature.trim() : "";
  const roundId = typeof record.roundId === "string" ? record.roundId : "";
  if (!signature || !roundId) {
    return Response.json({ ok: false, error: "Send the transaction signature and round id." }, { status: 400 });
  }

  const verified = await verifyDeposit(signature);
  if (!verified.ok) return Response.json(verified, { status: 400 });

  const placed = placeBet({
    roundId,
    wallet: verified.wallet,
    agentId: verified.agentId,
    amount: verified.amount,
    signature,
  });
  if (!placed.ok) return Response.json(placed, { status: 409 });
  return Response.json(placed);
}
