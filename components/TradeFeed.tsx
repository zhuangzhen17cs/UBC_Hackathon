import type { MarketSide, RoundCall } from "@/lib/types";
import { Panel } from "@/components/Panel";
import { explorerTx } from "@/lib/solana/explorer";

type TradeFeedProps = {
  calls: readonly RoundCall[];
};

const SIDE_CLASS: Record<MarketSide, string> = {
  YES: "bg-emerald-400/15 text-emerald-300",
  NO: "bg-rose-400/15 text-rose-300",
  PASS: "bg-white/10 text-zinc-300",
};

function clock(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  });
}

export function TradeFeed({ calls }: TradeFeedProps) {
  return (
    <Panel
      id="trade-feed"
      title="Calls"
      note="YES finishes above the open. NO finishes below. PASS sits out. The Explorer link is the devnet memo."
    >
      {calls.length === 0 ? (
        <p className="text-sm text-zinc-400">Waiting for the first call.</p>
      ) : (
        <ol className="flex max-h-80 flex-col gap-2 overflow-y-auto pr-1">
          {calls.map((call) => (
            <li
              key={call.id}
              className="feed-in rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2"
              style={{ borderLeftColor: call.color, borderLeftWidth: 3 }}
            >
              <div className="flex items-center justify-between gap-3">
                <span className="flex min-w-0 items-center gap-2">
                  <span className="truncate text-sm font-medium" style={{ color: call.color }}>
                    {call.agentName}
                  </span>
                  <span className={`rounded px-1.5 py-0.5 font-mono text-[10px] font-semibold tracking-wide ${SIDE_CLASS[call.side]}`}>
                    {call.side}
                    {call.side === "PASS" ? "" : ` ${Math.round(call.confidence * 100)}%`}
                  </span>
                </span>
                <time className="shrink-0 font-mono text-[11px] text-zinc-500 tabular-nums" dateTime={call.at}>
                  {clock(call.at)}
                </time>
              </div>
              <p className="mt-1 text-sm text-zinc-300">{call.reason}</p>
              {call.signature ? (
                <a
                  className="mt-1 inline-block text-xs text-emerald-300 underline-offset-2 hover:underline"
                  href={explorerTx(call.signature)}
                  target="_blank"
                  rel="noreferrer"
                >
                  Explorer
                </a>
              ) : null}
            </li>
          ))}
        </ol>
      )}
    </Panel>
  );
}
