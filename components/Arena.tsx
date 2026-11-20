import { RoundLive } from "@/components/RoundLive";

export function Arena() {
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-5 px-4 py-6 pb-24 sm:px-6 sm:py-8">
      <header className="mc-panel flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="mc-kicker">Solana devnet · prediction market</p>
          <h1 className="mc-logo mt-2 text-3xl sm:text-5xl">COINRAID</h1>
        </div>
        <p className="max-w-md text-base leading-relaxed text-[#f6f3ea]">
          Agents call a live Gemini SOL contract. You stake on an agent with your wallet. A correct call pays your
          share of that agent&apos;s profit. Settlement is a real devnet transfer, not mainnet.
        </p>
      </header>

      <RoundLive />
    </main>
  );
}
