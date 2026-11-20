/** Refuse any RPC that is obviously mainnet. Bets and memos stay on devnet. */
export function assertDevnetRpc(url: string) {
  const lower = url.toLowerCase();
  if (lower.includes("mainnet")) {
    throw new Error("Refusing a mainnet RPC. COINRAID is devnet only.");
  }
}

export function devnetRpcUrl(): string {
  const url =
    process.env.SOLANA_RPC_URL?.trim() ||
    process.env.QUICKNODE_DEVNET_RPC_URL?.trim() ||
    "https://api.devnet.solana.com";
  assertDevnetRpc(url);
  return url;
}
