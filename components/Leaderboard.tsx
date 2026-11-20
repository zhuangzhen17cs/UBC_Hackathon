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
            <li key={row.id} className="mc-slot relative overflow-hidden">
              <span
                className="absolute inset-y-0 left-0 opacity-25"
                style={{ width: `${width}%`, backgroundColor: row.color }}
                aria-hidden="true"
              />
              <div className="relative flex items-center justify-between gap-3 px-3 py-2 text-sm">
                <span className="flex min-w-0 items-center gap-3">
                  <span className="w-4 text-[#f6d56a] mc-num">{row.rank}</span>
                  <span
                    className="inline-block size-3 shrink-0 border-2 border-black"
                    style={{ backgroundColor: row.color }}
                    aria-hidden="true"
                  />
                  <span className="truncate font-bold">{row.name}</span>
                </span>
                <span className="text-right mc-num">
                  <span className="block text-[#fff8dc]">{row.stakeUsd.toFixed(2)}</span>
                  <span className="block text-sm text-[#ffe7a3]">{row.side}</span>
                </span>
              </div>
            </li>
          );
        })}
      </ol>
    </Panel>
  );
}
