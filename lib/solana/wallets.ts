import { Keypair, PublicKey } from "@solana/web3.js";
import bs58 from "bs58";
import type { AgentId } from "@/lib/types";

const AGENT_ENV: Record<AgentId, string> = {
  degen: "AGENT_DEGEN_SECRET_KEY",
  grandma: "AGENT_GRANDMA_SECRET_KEY",
  contrarian: "AGENT_CONTRARIAN_SECRET_KEY",
  grok: "AGENT_GROK_SECRET_KEY",
};

/** Accept a base58 secret or a Solana CLI JSON byte array. Never logs the key. */
export function keypairFromSecret(raw: string | undefined): Keypair | null {
  const text = raw?.trim();
  if (!text) return null;
  try {
    if (text.startsWith("[")) {
      const parsed = JSON.parse(text) as unknown;
      if (!Array.isArray(parsed)) return null;
      return Keypair.fromSecretKey(Uint8Array.from(parsed as number[]));
    }
    return Keypair.fromSecretKey(bs58.decode(text));
  } catch {
    return null;
  }
}

export function getEscrowKeypair(): Keypair | null {
  return keypairFromSecret(process.env.ESCROW_SECRET_KEY);
}

export function getAgentKeypair(agentId: AgentId): Keypair | null {
  const envName = AGENT_ENV[agentId];
  if (!envName) return null;
  return keypairFromSecret(process.env[envName]);
}

export function getEscrowPublicKey(): PublicKey | null {
  const fromSecret = getEscrowKeypair();
  if (fromSecret) return fromSecret.publicKey;
  const address = process.env.ESCROW_PUBLIC_KEY?.trim() || process.env.NEXT_PUBLIC_ESCROW_PUBLIC_KEY?.trim();
  if (!address) return null;
  try {
    return new PublicKey(address);
  } catch {
    return null;
  }
}

export function getUsdcMint(): PublicKey | null {
  const address = process.env.USDC_MINT?.trim() || process.env.NEXT_PUBLIC_USDC_MINT?.trim();
  if (!address) return null;
  try {
    return new PublicKey(address);
  } catch {
    return null;
  }
}

export const USDC_DECIMALS = 6;
export const USDC_FACTOR = 1_000_000;

export function usdcToRaw(amount: number): bigint {
  if (!Number.isFinite(amount) || amount <= 0) return 0n;
  return BigInt(Math.round(amount * USDC_FACTOR));
}

export function rawToUsdc(raw: bigint): number {
  return Math.round(Number(raw) / 10 ** (USDC_DECIMALS - 2)) / 100;
}
