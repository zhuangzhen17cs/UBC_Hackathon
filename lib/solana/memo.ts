import { Keypair, PublicKey, Transaction, TransactionInstruction } from "@solana/web3.js";
import { getConnection } from "@/lib/solana/connection";

const MEMO_PROGRAM = new PublicKey("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr");
const reported = new Set<string>();

function reportOnce(message: string) {
  if (reported.has(message)) return;
  reported.add(message);
  console.error(message);
}

/** Send a devnet memo. Returns the signature, or null when the wallet cannot pay the fee. */
export async function sendMemo(payer: Keypair, text: string): Promise<string | null> {
  try {
    const instruction = new TransactionInstruction({
      programId: MEMO_PROGRAM,
      keys: [{ pubkey: payer.publicKey, isSigner: true, isWritable: false }],
      data: Buffer.from(text.slice(0, 500), "utf8"),
    });
    const signature = await getConnection().sendTransaction(new Transaction().add(instruction), [payer]);
    return signature;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Memo failed.";
    reportOnce(`Devnet memo skipped: ${message}`);
    return null;
  }
}
