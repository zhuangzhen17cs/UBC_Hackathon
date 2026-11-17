import { existsSync, readFileSync, writeFileSync } from "node:fs";
import {
  createMint,
  getAccount,
  getAssociatedTokenAddressSync,
  getOrCreateAssociatedTokenAccount,
  mintTo,
} from "@solana/spl-token";
import { Keypair, LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import bs58 from "bs58";
import { loadLocalEnv } from "@/lib/env";
import { devnetRpcUrl } from "@/lib/solana/cluster";
import { getConnection } from "@/lib/solana/connection";
import { keypairFromSecret } from "@/lib/solana/wallets";

/**
 * Creates the devnet escrow, four agent wallets, a spectator wallet, and the arena USDC mint.
 * Public addresses are printed. Secret keys are written to .env.local and never printed.
 * Safe to run again: existing keys and the mint are reused.
 */

const AIRDROP = 1 * LAMPORTS_PER_SOL;
const SPECTATOR_USDC = 10_000n * 1_000_000n;
const MINT_DECIMALS = 6;

loadLocalEnv();

function upsertEnv(updates: Record<string, string>) {
  const path = ".env.local";
  const current = existsSync(path) ? readFileSync(path, "utf8").split("\n") : [];
  const keys = new Set(Object.keys(updates));
  const kept = current.filter((line) => {
    const key = line.split("=")[0]?.trim() ?? "";
    return !keys.has(key);
  });
  while (kept.length > 0 && kept[kept.length - 1] === "") kept.pop();
  const next = [...kept, "", ...Object.entries(updates).map(([key, value]) => `${key}=${value}`), ""];
  writeFileSync(path, next.join("\n"));
}

function loadOrCreate(envName: string): Keypair {
  const existing = keypairFromSecret(process.env[envName]);
  if (existing) return existing;
  const created = Keypair.generate();
  process.env[envName] = bs58.encode(created.secretKey);
  return created;
}

async function fund(label: string, keypair: Keypair) {
  const connection = getConnection();
  const balance = await connection.getBalance(keypair.publicKey);
  if (balance >= 0.05 * LAMPORTS_PER_SOL) {
    console.log(`${label} already has devnet SOL.`);
    return true;
  }
  try {
    const signature = await connection.requestAirdrop(keypair.publicKey, AIRDROP);
    await connection.confirmTransaction(signature, "confirmed");
    console.log(`${label} airdropped 1 SOL.`);
    return true;
  } catch (error) {
    const raw = error instanceof Error ? error.message : "airdrop failed";
    const parsed = raw.match(/"message":"([^"]+)"/);
    const message = (parsed?.[1] ?? raw).replace(/\s+/g, " ").slice(0, 160);
    console.log(`${label} airdrop failed: ${message}`);
    console.log(`  Fund ${keypair.publicKey.toBase58()} at https://faucet.solana.com`);
    return false;
  }
}

async function main() {
  const rpc = devnetRpcUrl();
  console.log("Devnet only. No real funds. No secret keys are printed.");
  console.log(`RPC ${rpc}`);

  const escrow = loadOrCreate("ESCROW_SECRET_KEY");
  const degen = loadOrCreate("AGENT_DEGEN_SECRET_KEY");
  const grandma = loadOrCreate("AGENT_GRANDMA_SECRET_KEY");
  const contrarian = loadOrCreate("AGENT_CONTRARIAN_SECRET_KEY");
  const grok = loadOrCreate("AGENT_GROK_SECRET_KEY");
  const spectator = loadOrCreate("DEMO_SPECTATOR_SECRET_KEY");

  const updates: Record<string, string> = {
    SOLANA_NETWORK: "devnet",
    SOLANA_RPC_URL: rpc,
    NEXT_PUBLIC_SOLANA_NETWORK: "devnet",
    NEXT_PUBLIC_SOLANA_RPC_URL: process.env.NEXT_PUBLIC_SOLANA_RPC_URL?.trim() || rpc,
    USDC_DECIMALS: String(MINT_DECIMALS),
    ESCROW_PUBLIC_KEY: escrow.publicKey.toBase58(),
    NEXT_PUBLIC_ESCROW_PUBLIC_KEY: escrow.publicKey.toBase58(),
    ESCROW_SECRET_KEY: process.env.ESCROW_SECRET_KEY ?? "",
    AGENT_DEGEN_SECRET_KEY: process.env.AGENT_DEGEN_SECRET_KEY ?? "",
    AGENT_GRANDMA_SECRET_KEY: process.env.AGENT_GRANDMA_SECRET_KEY ?? "",
    AGENT_CONTRARIAN_SECRET_KEY: process.env.AGENT_CONTRARIAN_SECRET_KEY ?? "",
    AGENT_GROK_SECRET_KEY: process.env.AGENT_GROK_SECRET_KEY ?? "",
    DEMO_SPECTATOR_SECRET_KEY: process.env.DEMO_SPECTATOR_SECRET_KEY ?? "",
    DEMO_SPECTATOR_PUBLIC_KEY: spectator.publicKey.toBase58(),
  };
  if (process.env.USDC_MINT?.trim()) {
    updates.USDC_MINT = process.env.USDC_MINT.trim();
    updates.NEXT_PUBLIC_USDC_MINT = process.env.USDC_MINT.trim();
  }
  upsertEnv(updates);

  console.log(`Escrow     ${escrow.publicKey.toBase58()}`);
  console.log(`Degen      ${degen.publicKey.toBase58()}`);
  console.log(`Grandma    ${grandma.publicKey.toBase58()}`);
  console.log(`Contrarian ${contrarian.publicKey.toBase58()}`);
  console.log(`Grok       ${grok.publicKey.toBase58()}`);
  console.log(`Spectator  ${spectator.publicKey.toBase58()}`);
  console.log("Secret keys were written to .env.local.");

  const wallets: [string, Keypair][] = [
    ["Escrow", escrow],
    ["Degen", degen],
    ["Grandma", grandma],
    ["Contrarian", contrarian],
    ["Grok", grok],
    ["Spectator", spectator],
  ];
  let escrowFunded = false;
  for (const [label, keypair] of wallets) {
    const ok = await fund(label, keypair);
    if (label === "Escrow") escrowFunded = ok;
  }

  if (!escrowFunded && (await getConnection().getBalance(escrow.publicKey)) < 0.05 * LAMPORTS_PER_SOL) {
    console.log("Mint skipped until the escrow has devnet SOL. Re-run this script after funding.");
    return;
  }

  const connection = getConnection();
  let mintAddress = process.env.USDC_MINT?.trim() ?? "";
  if (!mintAddress) {
    const created = await createMint(connection, escrow, escrow.publicKey, null, MINT_DECIMALS);
    mintAddress = created.toBase58();
    process.env.USDC_MINT = mintAddress;
    upsertEnv({ USDC_MINT: mintAddress, NEXT_PUBLIC_USDC_MINT: mintAddress });
    console.log(`Minted arena USDC ${mintAddress}`);
  } else {
    console.log(`Reusing mint ${mintAddress}`);
  }

  const mint = new PublicKey(mintAddress);
  await getOrCreateAssociatedTokenAccount(connection, escrow, mint, escrow.publicKey);
  const spectatorAccount = await getOrCreateAssociatedTokenAccount(connection, escrow, mint, spectator.publicKey);
  const current = await getAccount(connection, spectatorAccount.address);
  if (current.amount < SPECTATOR_USDC) {
    await mintTo(connection, escrow, mint, spectatorAccount.address, escrow, SPECTATOR_USDC - current.amount);
    console.log("Spectator funded with 10000 arena USDC.");
  } else {
    console.log("Spectator already has arena USDC.");
  }

  const escrowAta = getAssociatedTokenAddressSync(mint, escrow.publicKey);
  console.log(`Escrow token account ${escrowAta.toBase58()}`);
  console.log("Restart npm run dev so the server reads .env.local.");
  console.log("Import DEMO_SPECTATOR_SECRET_KEY from .env.local into Phantom, then switch Phantom to Devnet.");
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Setup failed.";
  console.error(message);
  process.exitCode = 1;
});
