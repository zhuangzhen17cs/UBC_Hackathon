import { connection } from "next/server";
import { devnetRpcUrl } from "@/lib/solana/cluster";

/** Public devnet addresses. Secret keys are never returned. */
export async function GET() {
  await connection();
  let rpcUrl = "https://api.devnet.solana.com";
  try {
    rpcUrl = devnetRpcUrl();
  } catch (error) {
    const message = error instanceof Error ? error.message : "RPC refused.";
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
  return Response.json(
    {
      ok: true,
      network: "devnet",
      rpcUrl,
      usdcMint: process.env.USDC_MINT?.trim() || "",
      escrow: process.env.ESCROW_PUBLIC_KEY?.trim() || "",
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
