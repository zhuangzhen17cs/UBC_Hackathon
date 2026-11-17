"use client";

import { useEffect, useState } from "react";
import { Panel } from "@/components/Panel";
import type { PriceSnapshot } from "@/lib/types";

const POLL_MS = 4_000;

type Tape = {
  priceUsd: number | null;
  history: number[];
};

const usd = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function sourceLabel(snapshot: PriceSnapshot): string {
  if (snapshot.source === "quicknode" && !snapshot.stale) return "QuickNode";
  if (snapshot.mode === "quicknode") return "Public market · stream quiet";
  if (snapshot.stale) return "Public market · cached";
  return "Public market";
}

function Sparkline({ prices }: { prices: number[] }) {
  if (prices.length < 2) return null;

  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const span = max - min || 1;
  const coords = prices.map((price, index) => {
    const x = (index / (prices.length - 1)) * 100;
    const y = 36 - ((price - min) / span) * 32;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const line = coords.join(" ");
  const area = `0,40 ${line} 100,40`;

  return (
    <svg viewBox="0 0 100 40" preserveAspectRatio="none" className="h-24 w-full" aria-hidden="true">
      <polygon points={area} fill="#34d399" opacity="0.18" />
      <polyline fill="none" stroke="#34d399" strokeWidth="1.4" points={line} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

export function PriceChart({ tape = null }: { tape?: Tape | null }) {
  const [snapshot, setSnapshot] = useState<PriceSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let pending = false;

    async function load() {
      if (pending) return;
      pending = true;
      try {
        const response = await fetch("/api/price", { cache: "no-store" });
        if (!response.ok) throw new Error(String(response.status));
        const body = (await response.json()) as PriceSnapshot;
        if (cancelled) return;
        setSnapshot(body);
        setError(body.ok ? null : "Price unavailable");
      } catch {
        if (!cancelled) setError("Price unavailable");
      } finally {
        pending = false;
      }
    }

    void load();
    const timer = setInterval(() => void load(), POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  const price = snapshot?.priceUsd;
  const observed = snapshot?.observedAt
    ? new Date(snapshot.observedAt).toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
        second: "2-digit",
      })
    : null;
  const showingTape = tape?.priceUsd != null;
  const displayPrice = showingTape ? tape.priceUsd : price;
  const displayHistory = showingTape ? tape.history : (snapshot?.history.map((point) => point.priceUsd) ?? []);

  return (
    <Panel
      id="price-chart"
      title="SOL / USD"
      note={
        showingTape
          ? "Demo tape. The short round swings this price. The open is the first print, and the close settles the market."
          : "Public market feed until a QuickNode Stream is connected."
      }
    >
      <div className="flex min-h-40 flex-col justify-between gap-3">
        {displayPrice == null ? (
          <p className="font-mono text-sm text-zinc-400">{error ?? "Fetching SOL price…"}</p>
        ) : (
          <div>
            <p className="font-mono text-4xl tracking-tight text-zinc-50 tabular-nums sm:text-5xl">
              {usd.format(displayPrice)}
            </p>
            <p className="mt-1 text-xs text-zinc-400">
              {showingTape ? "Demo tape" : snapshot ? sourceLabel(snapshot) : "Public market"}
              {!showingTape && observed ? ` · ${observed}` : ""}
              {error && !showingTape ? " · update failed" : ""}
            </p>
          </div>
        )}
        <Sparkline prices={displayHistory} />
      </div>
    </Panel>
  );
}
