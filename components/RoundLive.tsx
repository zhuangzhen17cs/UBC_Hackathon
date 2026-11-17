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
    if (!running) return;
    const tick = () => setClock(Date.now());
    const kick = setTimeout(tick, 0);
    const timer = setInterval(tick, 1000);
    return () => {
      clearTimeout(kick);
      clearInterval(timer);
    };
  }, [running]);

  async function send(action: "start" | "open" | "finish", demo = false) {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/round", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action, demo }),
      });
      const body = (await response.json()) as { ok?: boolean; error?: string; round?: RoundSnapshot };
      if (!response.ok || !body.ok || !body.round) {
        setError(body.error ?? "Could not update the round.");
        return;
      }
      setRound(body.round);
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
  else if (round?.phase === "battle") status = remaining ? `Calls · ${remaining}` : "Calls";
  else if (settled && round?.result === "PUSH") status = "Push. Every stake is refunded.";
  else if (settled && winners.length === 0) status = `${round?.result ?? "Final"}. Nobody called it. Stakes go back.`;
  else if (settled) status = `${round?.result} · ${winners.join(", ")}`;
  if (!connected) status = `${status} Reconnecting.`;

  const bug = !connected ? "LINK" : running ? "LIVE" : round ? "FINAL" : "READY";
  const bugClass = !connected
    ? "border-rose-400/30 text-rose-200"
    : round?.phase === "battle"
      ? "border-rose-400/40 text-rose-100"
      : round?.phase === "betting"
        ? "border-amber-300/40 text-amber-100"
        : settled
          ? "border-emerald-300/40 text-emerald-100"
          : "border-white/10 text-zinc-100";

  const openLabel = formatPx(round?.openPrice);
  const nowLabel = formatPx(round?.priceUsd);

  return (
    <>
      <section aria-labelledby="round-status" className="flex flex-col gap-3">
        <div className={`flex flex-wrap items-center justify-between gap-4 rounded-2xl border bg-zinc-950/75 px-4 py-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] ${bugClass}`}>
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-zinc-400">
              <span
                className={`inline-block size-2 rounded-full bg-current ${running && connected ? "live-dot" : ""}`}
                aria-hidden="true"
              />
              {bug}
            </p>
            <p
              id="round-status"
              role="status"
              aria-live="polite"
              className="mt-1 text-2xl font-semibold tracking-tight text-zinc-50 tabular-nums sm:text-3xl"
            >
              {status}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="rounded-full border border-white/15 px-4 py-2 text-sm text-zinc-100 transition-colors hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white disabled:opacity-40"
              disabled={busy || running}
              onClick={() => void send("start", false)}
            >
              Start round
            </button>
            <button
              type="button"
              className="rounded-full bg-white px-4 py-2 text-sm font-medium text-zinc-950 transition-colors hover:bg-zinc-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white disabled:opacity-40"
              disabled={busy || running}
              onClick={() => void send("start", true)}
            >
              Start short round
            </button>
            {round?.phase === "betting" ? (
              <button
                type="button"
                className="rounded-full border border-amber-200/40 px-4 py-2 text-sm text-amber-100 transition-colors hover:bg-amber-200/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white disabled:opacity-40"
                disabled={busy}
                onClick={() => void send("open")}
              >
                Start calls now
              </button>
            ) : null}
            {round?.phase === "battle" ? (
              <button
                type="button"
                className="rounded-full border border-emerald-200/40 px-4 py-2 text-sm text-emerald-100 transition-colors hover:bg-emerald-200/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white disabled:opacity-40"
                disabled={busy || round.openPrice == null}
                onClick={() => void send("finish")}
              >
                Settle now
              </button>
            ) : null}
          </div>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-zinc-500">Market</p>
          <p className="mt-1 text-xl font-semibold tracking-tight text-zinc-50">{round?.question ?? MARKET_QUESTION}</p>
          <p className="mt-2 font-mono text-sm text-zinc-400 tabular-nums">
            Open {openLabel}
            <span className="mx-2 text-zinc-600">·</span>
            Now {nowLabel}
            {settled && round?.result ? (
              <>
                <span className="mx-2 text-zinc-600">·</span>
                {round.result}
              </>
            ) : null}
          </p>
        </div>
        <p className="text-xs text-zinc-500">
          {round?.demo
            ? "Short round: 20 seconds to stake, unless you start the calls early. The tape then runs about 3 minutes, unless you settle with the price on screen."
            : round
              ? "Full round: 2 minutes to stake, then a call every 15 seconds for 8 minutes. Start calls now skips the wait. Settle now uses the latest price."
              : "Stake during the window. The agent's last call is your side. Start short round if you want the scripted tape."}
        </p>
        {error ? <p className="text-sm text-rose-300">{error}</p> : null}
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
            tape={
              round?.demo && round.priceUsd != null
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
