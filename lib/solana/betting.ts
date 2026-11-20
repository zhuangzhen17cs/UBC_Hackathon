import { PublicKey } from "@solana/web3.js";
import { getOrCreateAssociatedTokenAccount, transfer, getAssociatedTokenAddressSync } from "@solana/spl-token";
import type { AgentId } from "@/lib/types";
import { getConnection } from "@/lib/solana/connection";
import { getEscrowKeypair, getEscrowPublicKey, getUsdcMint, rawToUsdc } from "@/lib/solana/wallets";

const MIN_RAW = 1_000_000n;
const MAX_RAW = 500_000_000n;

type TokenRow = {
  accountIndex: number;
  mint: string;
  owner?: string;
  uiTokenAmount: { amount: string };
};

export type VerifiedBet =
  | { ok: true; wallet: string; agentId: AgentId; amount: number }
  | { ok: false; error: string };

/** Confirm a devnet USDC transfer into escrow and read which agent the memo names. */
export async function verifyDeposit(signature: string): Promise<VerifiedBet> {
  if (!/^[1-9A-HJ-NP-Za-km-z]{32,100}$/.test(signature)) {
    return { ok: false, error: "That is not a transaction signature." };
  }
  const mint = getUsdcMint();
  const escrow = getEscrowPublicKey();
  if (!mint || !escrow) {
    return { ok: false, error: "Run npm run setup:devnet and restart the server." };
  }

  let tx: Awaited<ReturnType<ReturnType<typeof getConnection>["getTransaction"]>>;
  try {
    tx = await getConnection().getTransaction(signature, {
      commitment: "confirmed",
      maxSupportedTransactionVersion: 0,
    });
  } catch {
    return { ok: false, error: "Could not read that transaction." };
  }
  if (!tx?.meta || tx.meta.err) return { ok: false, error: "That transaction is not confirmed." };
  if (tx.blockTime && Date.now() / 1000 - tx.blockTime > 15 * 60) {
    return { ok: false, error: "That transaction is too old." };
  }

  const memo = (tx.meta.logMessages ?? []).find((line) => line.includes("COINRAID bet "));
  const match = memo?.match(/COINRAID bet ([a-z0-9-]{2,32})(?![a-z0-9-])/);
  const agentId = match?.[1];
  if (!agentId) return { ok: false, error: "The bet memo is missing." };

  const deltas = tokenDeltas(tx.meta.preTokenBalances ?? [], tx.meta.postTokenBalances ?? [], mint.toBase58());
  const gained = deltas.find((row) => row.owner === escrow.toBase58() && row.delta > 0n);
  const paid = deltas.find((row) => row.owner !== escrow.toBase58() && row.delta < 0n);
  if (!gained || !paid || gained.delta !== -paid.delta) {
    return { ok: false, error: "That transaction did not pay the escrow." };
  }
  if (gained.delta < MIN_RAW) return { ok: false, error: "Minimum bet is 1 USDC." };
  if (gained.delta > MAX_RAW) return { ok: false, error: "Maximum bet is 500 USDC." };

  return { ok: true, wallet: paid.owner, agentId: agentId as AgentId, amount: rawToUsdc(gained.delta) };
}

function tokenDeltas(pre: readonly TokenRow[], post: readonly TokenRow[], mint: string) {
  const accounts = new Map<number, { owner: string; pre: bigint; post: bigint }>();
  for (const row of pre) {
    if (row.mint !== mint || !row.owner) continue;
    accounts.set(row.accountIndex, { owner: row.owner, pre: BigInt(row.uiTokenAmount.amount), post: 0n });
  }
  for (const row of post) {
    if (row.mint !== mint || !row.owner) continue;
    const current = accounts.get(row.accountIndex) ?? { owner: row.owner, pre: 0n, post: 0n };
    current.owner = row.owner;
    current.post = BigInt(row.uiTokenAmount.amount);
    accounts.set(row.accountIndex, current);
  }
  return [...accounts.values()]
    .map((row) => ({ owner: row.owner, delta: row.post - row.pre }))
    .filter((row) => row.delta !== 0n);
}

/** Pay or refund a spectator from the escrow wallet. Devnet only. */
export async function sendUsdc(wallet: string, raw: bigint): Promise<string> {
  const escrow = getEscrowKeypair();
  const mint = getUsdcMint();
  if (!escrow || !mint) throw new Error("Escrow wallet or USDC mint is not configured.");
  if (raw <= 0n) throw new Error("Nothing to send.");

  const connection = getConnection();
  const destination = new PublicKey(wallet);
  const from = getAssociatedTokenAddressSync(mint, escrow.publicKey);
  const to = await getOrCreateAssociatedTokenAccount(connection, escrow, mint, destination);
  return transfer(connection, escrow, from, to.address, escrow, raw);
}
