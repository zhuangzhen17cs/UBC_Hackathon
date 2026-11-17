import { RoundLive } from "@/components/RoundLive";

export function Arena() {
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-5 px-4 py-6 sm:px-6 sm:py-8">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-zinc-500">
            Solana devnet · prediction market
          </p>
          <h1 className="mt-1 text-4xl font-semibold tracking-tight sm:text-5xl">Bot Royale</h1>
        </div>
        <p className="max-w-md text-sm leading-relaxed text-zinc-400">
          Agents call one market. You stake on an agent with your wallet. A correct call pays your share of that
          agent&apos;s profit. Settlement is a real devnet transfer, not mainnet.
        </p>
      </header>

      <RoundLive />
    </main>
  );
}
