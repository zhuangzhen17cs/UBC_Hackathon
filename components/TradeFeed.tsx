import type { MarketSide, RoundCall } from "@/lib/types";
import { Panel } from "@/components/Panel";
import { explorerTx } from "@/lib/solana/explorer";

type TradeFeedProps = {
  calls: readonly RoundCall[];
};

const SIDE_CLASS: Record<MarketSide, string> = {
  YES: "mc-chip mc-chip-yes",
  NO: "mc-chip mc-chip-no",
  PASS: "mc-chip mc-chip-pass",
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
      note="YES means the Gemini Up contract resolves yes. NO means it resolves no. PASS sits out."
    >
      {calls.length === 0 ? (
        <p className="text-base text-[#d9cbb6]">Waiting for the first call.</p>
      ) : (
        <ol className="flex max-h-80 flex-col gap-2 overflow-y-auto pr-1">
          {calls.map((call) => (
            <li
              key={call.id}
              className="feed-in mc-slot px-3 py-2"
              style={{ boxShadow: `inset 6px 0 0 ${call.color}` }}
            >
              <div className="flex items-center justify-between gap-3">
                <span className="flex min-w-0 items-center gap-2">
                  <span className="truncate text-sm font-medium" style={{ color: call.color }}>
                    {call.agentName}
                  </span>
                  <span className={SIDE_CLASS[call.side]}>
                    {call.side}
                    {call.side === "PASS" ? "" : ` ${Math.round(call.confidence * 100)}%`}
                  </span>
                </span>
                <time className="shrink-0 text-sm text-[#ffe7a3] mc-num" dateTime={call.at}>
                  {clock(call.at)}
                </time>
              </div>
              <p className="mt-1 text-base text-[#f0e6d4]">{call.reason}</p>
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
