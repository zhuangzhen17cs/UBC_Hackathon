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

const CHIP: Record<MarketSide, string> = {
  YES: "mc-chip mc-chip-yes",
  NO: "mc-chip mc-chip-no",
  PASS: "mc-chip mc-chip-pass",
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
  const badge = winner ? "WIN" : called ? side : "OPEN";

  return (
    <article className="mc-card relative flex h-full flex-col p-3">
      <div className="mb-3 h-3 border-2 border-black" style={{ background: color }} aria-hidden="true" />
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <span className="mc-face" style={{ background: color }} aria-hidden="true">
            <i />
            <i />
            <i />
            <i />
            <i />
          </span>
          <h3 className="text-xl font-bold leading-tight" style={{ color }}>
            {name}
          </h3>
        </div>
        <span className={`shrink-0 ${winner ? "mc-chip mc-chip-yes" : CHIP[called ? side : "PASS"]}`}>{badge}</span>
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        <span className="mc-chip">{PROVIDER_LABEL[provider]}</span>
        {custom ? <span className="mc-chip">Yours</span> : null}
      </div>
      <p className="mt-3 min-h-12 flex-1 text-base text-[#f0e6d4]">{called && reason ? reason : tagline}</p>
      <div className="mt-4 flex items-end justify-between gap-3">
        <p className="text-2xl mc-num text-[#fff8dc]">
          {stakeUsd.toFixed(2)}
          <span className="ml-1 text-sm text-[#d9cbb6]">staked</span>
        </p>
        {called && side !== "PASS" ? (
          <p className="text-base mc-num text-[#ffe7a3]">{Math.round(confidence * 100)}%</p>
        ) : null}
      </div>
    </article>
  );
}
