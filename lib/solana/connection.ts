import { Connection } from "@solana/web3.js";
import { devnetRpcUrl } from "@/lib/solana/cluster";

let cached: Connection | null = null;
let cachedUrl = "";

/** One confirmed-commitment connection for this process. */
export function getConnection(): Connection {
  const url = devnetRpcUrl();
  if (!cached || cachedUrl !== url) {
    cached = new Connection(url, "confirmed");
    cachedUrl = url;
  }
  return cached;
}
