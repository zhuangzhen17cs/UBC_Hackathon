import type { RoundAgentState } from "@/lib/types";
import { Panel } from "@/components/Panel";

type LeaderboardProps = {
  rows: readonly RoundAgentState[];
  settled: boolean;
};

export function Leaderboard({ rows, settled }: LeaderboardProps) {
  const peak = rows.reduce((max, row) => Math.max(max, row.stakeUsd), 1);

  return (
    <Panel
      id="leaderboard"
      title="The book"
      note={
        settled
          ? "Backers of a correct call split that agent's profit by stake. Payouts leave the escrow wallet."
          : "Stake behind each agent. Their last call is the side you are on."
      }
    >
      <ol className="flex flex-col gap-2">
        {rows.map((row) => {
          const width = row.stakeUsd > 0 ? Math.max(8, (row.stakeUsd / peak) * 100) : 0;
          return (
            <li key={row.id} className="relative overflow-hidden rounded-xl border border-white/10 bg-white/[0.03]">
              <span
                className="absolute inset-y-0 left-0 opacity-25"
                style={{ width: `${width}%`, backgroundColor: row.color }}
                aria-hidden="true"
              />
              <div className="relative flex items-center justify-between gap-3 px-3 py-2 text-sm">
                <span className="flex min-w-0 items-center gap-3">
                  <span className="w-4 font-mono text-zinc-400 tabular-nums">{row.rank}</span>
                  <span
                    className="inline-block size-2 shrink-0 rounded-full"
                    style={{ backgroundColor: row.color }}
                    aria-hidden="true"
                  />
                  <span className="truncate font-medium">{row.name}</span>
                </span>
                <span className="text-right font-mono tabular-nums">
                  <span className="block text-zinc-50">{row.stakeUsd.toFixed(2)}</span>
                  <span className="block text-[11px] text-zinc-500">{row.side}</span>
                </span>
              </div>
            </li>
          );
        })}
      </ol>
    </Panel>
  );
}
