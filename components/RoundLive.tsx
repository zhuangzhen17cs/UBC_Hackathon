"use client";

import { useEffect, useState } from "react";
import { AGENTS } from "@/lib/agents/personalities";
import { AgentCard } from "@/components/AgentCard";
import { BettingPanel } from "@/components/BettingPanel";
import { CommentaryPlayer } from "@/components/CommentaryPlayer";
import { CreateAgent } from "@/components/CreateAgent";
import { Leaderboard } from "@/components/Leaderboard";
import { PriceChart } from "@/components/PriceChart";
import { TradeFeed } from "@/components/TradeFeed";
import { MARKET_QUESTION } from "@/lib/market/question";
import type { PublicAgent, RoundSnapshot, RoundStreamEvent } from "@/lib/types";

function formatRemaining(endsAt: string, now: number): string {
  const ms = new Date(endsAt).getTime() - now;
  const total = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function formatPx(price: number | null | undefined): string {
  if (price == null || !Number.isFinite(price)) return "—";
  return `$${price.toFixed(2)}`;
}

function defaultRoster(): PublicAgent[] {
  return AGENTS.map((agent) => ({ ...agent, custom: false }));
}

export function RoundLive() {
  const [round, setRound] = useState<RoundSnapshot | null>(null);
  const [roster, setRoster] = useState<PublicAgent[]>(defaultRoster);
  const [connected, setConnected] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [clock, setClock] = useState<number | null>(null);

  useEffect(() => {
    const source = new EventSource("/api/stream");
    source.onopen = () => setConnected(true);
    source.onerror = () => setConnected(false);
    source.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data) as RoundStreamEvent;
        if (payload.type === "round") setRound(payload.round);
      } catch {
        // Ignore a malformed event and keep the last good snapshot.
      }
    };
    return () => source.close();
  }, []);

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/agents", { cache: "no-store" })
      .then((response) => response.json())
      .then((body: { agents?: PublicAgent[] }) => {
        if (!cancelled && Array.isArray(body.agents) && body.agents.length > 0) setRoster(body.agents);
      })
      .catch(() => {
        // The built-in four stay on screen if the desk route is down.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const running = round?.phase === "betting" || round?.phase === "battle";

  useEffect(() => {
    if (round?.phase === "settlement") setError(null);
  }, [round?.phase, round?.result]);

  useEffect(() => {
    if (!running) return;
    const tick = () => setClock(Date.now());
    const kick = setTimeout(tick, 0);
    const timer = setInterval(tick, 1000);
    return () => {
      clearTimeout(kick);
      clearInterval(timer);
    };
  }, [running]);

  async function send(action: "start" | "open" | "finish" | "close", demo = false) {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/round", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action, demo }),
      });
      const body = (await response.json()) as { ok?: boolean; error?: string; round?: RoundSnapshot | null };
      if (!response.ok || !body.ok) {
        setError(body.error ?? "Could not update the round.");
        return;
      }
      setRound(body.round ?? null);
    } catch {
      setError("Could not update the round.");
    } finally {
      setBusy(false);
    }
  }

  const rows = round?.agents ?? roster.map((agent) => ({
    id: agent.id,
    name: agent.name,
    color: agent.color,
    provider: agent.provider,
    custom: agent.custom,
    side: "PASS" as const,
    confidence: 0,
    reason: "",
    stakeUsd: 0,
    rank: 1,
  }));
  const taglineById = new Map(roster.map((agent) => [agent.id, agent.tagline]));
  const remaining = clock != null && round && running ? formatRemaining(round.phaseEndsAt, clock) : null;
  const winners = round?.phase === "settlement" ? rows.filter((row) => round.winnerIds.includes(row.id)).map((row) => row.name) : [];
  const settled = round?.phase === "settlement";
  const called = round?.phase === "battle" || settled;

  let status = "Lobby. Stake an agent before the calls start.";
  if (round?.phase === "betting") status = remaining ? `Staking · ${remaining}` : "Staking";
  else if (round?.contract?.awaitingResult) status = "Waiting for Gemini";
  else if (round?.phase === "battle") status = remaining ? `Calls · ${remaining}` : "Calls";
  else if (settled && round?.result === "PUSH") status = "Push. Every stake is refunded.";
  else if (settled && winners.length === 0) status = `${round?.result ?? "Final"}. Nobody called it. Stakes go back.`;
  else if (settled) status = `${round?.result} · ${winners.join(", ")}`;
  if (!connected) status = `${status} Reconnecting.`;

  const bug = !connected ? "LINK" : running ? "LIVE" : round ? "FINAL" : "READY";

  const contract = round?.contract ?? null;
  const yesLabel = formatPx(contract?.yesPrice ?? round?.priceUsd);
  const strikeLabel = formatPx(contract?.strike ?? round?.openPrice);
  const endsLabel = contract
    ? new Date(contract.expiresAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", second: "2-digit" })
    : null;

  return (
    <>
      <section aria-labelledby="round-status" className="flex flex-col gap-3">
        <div className="mc-panel flex flex-wrap items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="mc-label flex items-center gap-2">
              <span
                className={`inline-block size-3 border-2 border-black bg-[#f6d56a] ${running && connected ? "live-dot" : ""}`}
                aria-hidden="true"
              />
              {bug}
            </p>
            <p
              id="round-status"
              role="status"
              aria-live="polite"
              className="mt-2 text-3xl font-bold text-[#fff8dc] sm:text-4xl"
            >
              {status}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="mc-btn" disabled={busy || running} onClick={() => void send("start", false)}>
              Start round
            </button>
            <button type="button" className="mc-btn mc-btn-go" disabled={busy || running} onClick={() => void send("start", true)}>
              Start short round
            </button>
            {round?.phase === "betting" ? (
              <button type="button" className="mc-btn mc-btn-gold" disabled={busy} onClick={() => void send("open")}>
                Start calls now
              </button>
            ) : null}
            {round?.phase === "battle" ? (
              <button type="button" className="mc-btn mc-btn-go" disabled={busy} onClick={() => void send("finish")}>
                Settle now
              </button>
            ) : null}
            {round ? (
              <button type="button" className="mc-btn" disabled={busy} onClick={() => void send("close")}>
                {settled ? "Back to lobby" : "End round"}
              </button>
            ) : null}
          </div>
        </div>
        <div className="mc-panel">
          <p className="mc-label">Market</p>
          <p className="mt-2 text-xl font-bold leading-snug text-[#fff8dc] sm:text-2xl">{round?.question ?? MARKET_QUESTION}</p>
          <p className="mt-2 text-lg text-[#fff8dc] mc-num">
            Yes {yesLabel}
            {contract?.bid != null && contract.ask != null ? (
              <span>{`  ${contract.bid.toFixed(2)}–${contract.ask.toFixed(2)}`}</span>
            ) : null}
            <span className="mx-2 text-[#8d7b66]">·</span>
            Strike {strikeLabel}
            {endsLabel ? (
              <>
                <span className="mx-2 text-[#8d7b66]">·</span>
                Ends {endsLabel}
              </>
            ) : null}
            {settled && round?.result ? (
              <>
                <span className="mx-2 text-[#8d7b66]">·</span>
                {round.result}
              </>
            ) : null}
          </p>
          {contract ? (
            <p className="mt-1 text-sm text-[#ffe7a3] mc-num">{contract.instrumentSymbol}</p>
          ) : null}
        </div>
        <p className="mc-note text-sm">
          {round
            ? "Locked to the next Gemini SOL 5-minute contract. Start calls now skips the staking wait. The round settles when Gemini publishes Up or not. Stakes still move on devnet."
            : "Stake an agent before the calls. A short round gives you 20 seconds. Gemini's result settles it."}
        </p>
        {error && round?.phase !== "settlement" ? <p className="mc-note border-[#7a2c22] bg-[#ffd9d2] text-sm text-[#7a2c22]">{error}</p> : null}
      </section>

      <section aria-labelledby="agents-heading">
        <h2 id="agents-heading" className="sr-only">
          Agents
        </h2>
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {rows.map((row) => (
            <li key={row.id}>
              <AgentCard
                name={row.name}
                tagline={taglineById.get(row.id) ?? row.reason}
                color={row.color}
                provider={row.provider}
                custom={row.custom}
                side={row.side}
                confidence={row.confidence}
                reason={row.reason}
                stakeUsd={row.stakeUsd}
                winner={Boolean(round && round.winnerIds.includes(row.id))}
                called={Boolean(called)}
              />
            </li>
          ))}
        </ul>
      </section>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-5">
        <div className="lg:col-span-2">
          <Leaderboard rows={rows} settled={settled} />
        </div>
        <div className="lg:col-span-3">
          <PriceChart
            contract={Boolean(round?.contract)}
            tape={
              round?.contract && round.priceUsd != null
                ? { priceUsd: round.priceUsd, history: round.priceHistory }
                : null
            }
          />
        </div>
      </div>

      <TradeFeed calls={round?.calls ?? []} />

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <BettingPanel round={round} />
        <div className="flex flex-col gap-3">
          <CreateAgent
            onCreated={(agent) => {
              setRoster((current) => (current.some((item) => item.id === agent.id) ? current : [...current, agent]));
            }}
          />
          <CommentaryPlayer line={round?.commentary ?? null} />
        </div>
      </div>
    </>
  );
}
