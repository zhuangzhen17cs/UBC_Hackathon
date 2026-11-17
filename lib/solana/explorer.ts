const CLUSTER = "devnet";

export function explorerTx(signature: string): string {
  return `https://explorer.solana.com/tx/${signature}?cluster=${CLUSTER}`;
}

export function explorerAddress(address: string): string {
  return `https://explorer.solana.com/address/${address}?cluster=${CLUSTER}`;
}
