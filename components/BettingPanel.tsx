"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { createAssociatedTokenAccountIdempotentInstruction, createTransferInstruction, getAssociatedTokenAddressSync } from "@solana/spl-token";
import { PublicKey, Transaction, TransactionInstruction } from "@solana/web3.js";
import { Buffer } from "buffer";
import { Panel } from "@/components/Panel";
import { quoteMarket } from "@/lib/engine/payouts";
import { explorerTx } from "@/lib/solana/explorer";
import type { RoundSnapshot } from "@/lib/types";

const WalletMultiButton = dynamic(
  () => import("@solana/wallet-adapter-react-ui").then((mod) => mod.WalletMultiButton),
  { ssr: false },
);

const MEMO_PROGRAM = new PublicKey("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr");

type ArenaConfig = {
  usdcMint: string;
  escrow: string;
};

type BettingPanelProps = {
  round: RoundSnapshot | null;
};

export function BettingPanel({ round }: BettingPanelProps) {
  const { connection } = useConnection();
  const { publicKey, sendTransaction, connected } = useWallet();
  const [config, setConfig] = useState<ArenaConfig | null>(null);
  const [agentId, setAgentId] = useState<string>("degen");
  const [amount, setAmount] = useState("50");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/config", { cache: "no-store" })
      .then((response) => response.json())
      .then((body: ArenaConfig & { ok?: boolean }) => {
        if (!cancelled && body.ok) setConfig({ usdcMint: body.usdcMint, escrow: body.escrow });
      })
      .catch(() => {
        if (!cancelled) setConfig({ usdcMint: "", escrow: "" });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const agents = round?.agents ?? [];
  const selectedId = agents.some((agent) => agent.id === agentId) ? agentId : agents[0]?.id ?? "degen";
  const bets = round?.bets ?? [];
  const { pool, quotes } = quoteMarket(
    bets,
    agents.map((agent) => ({ agentId: agent.id, side: agent.side })),
  );
  const open = round?.phase === "betting";
  const ready = Boolean(config?.usdcMint && config.escrow);
  const wallet = publicKey?.toBase58() ?? "";
  const selected = quotes.find((quote) => quote.agentId === selectedId);
  const typed = Number(amount);
  const adding = Number.isFinite(typed) && typed > 0 ? typed : 0;
  const projectedBook = (selected?.stake ?? 0) + (open ? adding : 0);
  const projectedShare = projectedBook > 0 && adding > 0 ? adding / projectedBook : 0;
  const yours = wallet
    ? bets.filter((bet) => bet.agentId === selectedId && bet.wallet === wallet).reduce((sum, bet) => sum + bet.amount, 0)
    : 0;
  const yourShare = selected && selected.stake > 0 && yours > 0 ? yours / selected.stake : 0;

  async function bet() {
    if (!publicKey || !config?.usdcMint || !config.escrow || !round || !selectedId) return;
    const usdc = Number(amount);
    if (!Number.isFinite(usdc) || usdc < 1 || usdc > 500) {
      setMessage("Stake between 1 and 500 USDC.");
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const mint = new PublicKey(config.usdcMint);
      const escrow = new PublicKey(config.escrow);
      const from = getAssociatedTokenAddressSync(mint, publicKey);
      const to = getAssociatedTokenAddressSync(mint, escrow);
      const raw = Math.round(usdc * 1_000_000);
      const tx = new Transaction().add(
        createAssociatedTokenAccountIdempotentInstruction(publicKey, to, escrow, mint),
        createTransferInstruction(from, to, publicKey, raw),
        new TransactionInstruction({
          programId: MEMO_PROGRAM,
          keys: [{ pubkey: publicKey, isSigner: true, isWritable: false }],
          data: Buffer.from(`COINRAID bet ${selectedId}`),
        }),
      );
      const signature = await sendTransaction(tx, connection);
      await connection.confirmTransaction(signature, "confirmed");
      const response = await fetch("/api/bet", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ signature, roundId: round.id }),
      });
      const body = (await response.json()) as { ok?: boolean; error?: string };
      if (!response.ok || !body.ok) {
        setMessage(body.error ?? "The stake was not counted.");
        return;
      }
      setMessage("Stake counted. Phantom signed a real devnet transfer.");
    } catch (error) {
      const text = error instanceof Error ? error.message : "The wallet did not send the stake.";
      setMessage(text.replace(/\s+/g, " ").slice(0, 180));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel
      id="betting"
      title="Stake an agent"
      note="You split that agent's profit by stake. $50 on a $100 book is half the profit, and the stake comes back with it. A wrong call loses the stake. PASS refunds it. House fee is 0. Devnet only."
    >
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="mc-label">Pool</p>
          <p className="text-3xl text-[#fff8dc] mc-num">{pool.toFixed(2)} USDC</p>
        </div>
        <WalletMultiButton />
      </div>

      <ul className="mt-4 flex flex-col gap-2">
        {agents.map((agent) => {
          const quote = quotes.find((item) => item.agentId === agent.id);
          const profit = quote?.profitIfSideWins;
          return (
            <li key={agent.id} className="mc-slot flex items-center justify-between gap-3 px-2 py-1 text-base">
              <span className="flex min-w-0 items-center gap-2">
                <span className="inline-block size-3 shrink-0 border-2 border-black" style={{ backgroundColor: agent.color }} aria-hidden="true" />
                <span className="truncate font-bold">{agent.name}</span>
                <span className="text-xs text-[#f6d56a]">{agent.side}</span>
              </span>
              <span className="shrink-0 text-[#f0e6d4] mc-num">
                {(quote?.stake ?? 0).toFixed(2)}
                {profit == null ? "" : ` · +${profit.toFixed(2)} if ${agent.side}`}
              </span>
            </li>
          );
        })}
      </ul>

      {ready ? (
        open ? (
          connected ? (
            <form
              className="mt-4 flex flex-col gap-3"
              onSubmit={(event) => {
                event.preventDefault();
                void bet();
              }}
            >
              <div className="flex flex-wrap gap-2">
                {agents.map((agent) => (
                  <button
                    key={agent.id}
                    type="button"
                    className={`mc-btn ${selectedId === agent.id ? "mc-btn-gold" : ""}`}
                    onClick={() => setAgentId(agent.id)}
                  >
                    {agent.name}
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap gap-2">
                <label className="sr-only" htmlFor="bet-amount">
                  USDC amount
                </label>
                <input
                  id="bet-amount"
                  inputMode="decimal"
                  value={amount}
                  onChange={(event) => setAmount(event.target.value)}
                  className="mc-input w-28"
                />
                <button
                  type="submit"
                  disabled={busy || agents.length === 0}
                  className="mc-btn mc-btn-go"
                >
                  {busy ? "Sending…" : "Stake USDC"}
                </button>
              </div>
              {projectedShare > 0 ? (
                <p className="text-base text-[#f0e6d4]">
                  This stake would be {Math.round(projectedShare * 100)}% of the book on this agent, so it would take that share of the profit.
                </p>
              ) : null}
            </form>
          ) : (
            <p className="mt-4 text-base text-[#f0e6d4]">Connect Phantom on Devnet. The stake is a real token transfer to escrow.</p>
          )
        ) : (
          <p className="mt-4 text-base text-[#f0e6d4]">
            {round ? "The window is closed. Their last call is the side." : "Start a round to open the window."}
          </p>
        )
      ) : config?.escrow ? (
        <p className="mt-4 text-base text-[#f0e6d4]">
          Escrow is ready. Fund it with devnet SOL at faucet.solana.com, run npm run setup:devnet again, then restart the server. That mints the arena USDC the wallet sends.
        </p>
      ) : (
        <p className="mt-4 text-base text-[#f0e6d4]">Run npm run setup:devnet, then restart the server. Devnet only.</p>
      )}

      {yourShare > 0 && selected?.profitIfSideWins != null ? (
        <p className="mt-3 text-base text-[#b6e38a]">
          You hold {Math.round(yourShare * 100)}% of this agent. If {selected.side} hits, your cut of the profit is{" "}
          {(selected.profitIfSideWins * yourShare).toFixed(2)} USDC, plus your stake back.
        </p>
      ) : null}

      {message ? <p className="mt-3 text-base text-[#fff8dc]">{message}</p> : null}

      {round && round.payouts.length > 0 ? (
        <ul className="mt-4 flex flex-col gap-2 text-sm">
          {round.payouts.map((payout) => (
            <li key={`${payout.wallet}-${payout.kind}-${payout.amount}`} className="flex items-center justify-between gap-3">
              <span className="truncate text-sm text-[#d9cbb6]">
                {payout.kind === "refund" ? "Refund" : "Paid"} {payout.amount.toFixed(2)} · {payout.wallet.slice(0, 4)}…{payout.wallet.slice(-4)}
              </span>
              {payout.signature ? (
                <a className="shrink-0 text-emerald-300 underline-offset-2 hover:underline" href={explorerTx(payout.signature)} target="_blank" rel="noreferrer">
                  Explorer
                </a>
              ) : (
                <span className="shrink-0 text-rose-300">{payout.error ?? "Pending"}</span>
              )}
            </li>
          ))}
        </ul>
      ) : null}
    </Panel>
  );
}
