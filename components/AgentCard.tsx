import { PROVIDER_LABEL } from "@/lib/agents/personalities";
import type { MarketSide, ModelProvider } from "@/lib/types";

type AgentCardProps = {
  name: string;
  tagline: string;
  color: string;
  provider: ModelProvider;
  custom: boolean;
  side: MarketSide;
  confidence: number;
  reason: string;
  stakeUsd: number;
  winner: boolean;
  /** A live or settled round shows the call. The lobby shows the tagline. */
  called: boolean;
};

const SIDE_CLASS: Record<MarketSide, string> = {
  YES: "bg-emerald-400/15 text-emerald-200",
  NO: "bg-rose-400/15 text-rose-200",
  PASS: "bg-white/10 text-zinc-300",
};

export function AgentCard({
  name,
  tagline,
  color,
  provider,
  custom,
  side,
  confidence,
  reason,
  stakeUsd,
  winner,
  called,
}: AgentCardProps) {
  return (
    <article
      className="relative flex h-full flex-col overflow-hidden rounded-2xl border border-white/10 bg-zinc-950/80 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]"
      style={{
        boxShadow: `inset 0 3px 0 ${color}, inset 0 1px 0 rgba(255,255,255,0.05)`,
      }}
    >
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-16 opacity-25"
        style={{ background: `linear-gradient(${color}, transparent)` }}
        aria-hidden="true"
      />
      <div className="relative flex items-start justify-between gap-3">
        <h3 className="text-lg font-semibold tracking-tight" style={{ color }}>
          {name}
        </h3>
        <span className={`rounded-full px-2 py-0.5 font-mono text-[11px] font-semibold tracking-wide ${SIDE_CLASS[side]}`}>
          {winner ? "WIN" : called ? side : "OPEN"}
        </span>
      </div>
      <div className="relative mt-2 flex flex-wrap gap-1.5">
        <span className="rounded-full border border-white/10 px-2 py-0.5 text-[11px] text-zinc-300">
          {PROVIDER_LABEL[provider]}
        </span>
        {custom ? (
          <span className="rounded-full border border-white/10 px-2 py-0.5 text-[11px] text-zinc-400">Yours</span>
        ) : null}
      </div>
      <p className="relative mt-3 min-h-10 flex-1 text-sm text-zinc-400">
        {called && reason ? reason : tagline}
      </p>
      <div className="relative mt-4 flex items-end justify-between gap-3">
        <p className="font-mono text-2xl tracking-tight text-zinc-50 tabular-nums">
          {stakeUsd.toFixed(2)}
          <span className="ml-1 text-xs font-medium tracking-normal text-zinc-500">staked</span>
        </p>
        {called && side !== "PASS" ? (
          <p className="font-mono text-xs text-zinc-500 tabular-nums">{Math.round(confidence * 100)}%</p>
        ) : null}
      </div>
    </article>
  );
}
