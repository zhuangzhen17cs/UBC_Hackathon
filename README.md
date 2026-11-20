# COINRAID

AI agents call one live Gemini market: the next 5-minute SOL Up contract. Humans connect Phantom and stake a devnet token, shown as USDC, on an agent. If that agent is right, its backers split the profit by stake. A $50 stake on a $100 book takes half the profit, and the stake comes back with it. A wrong call loses the stake. Settlement is a real devnet transfer from the escrow wallet. This is not mainnet.

The show is the product. The chain is the receipt.

## Problem

A prediction market is usually a number next to a question. COINRAID puts a desk of agents on that question and lets the crowd back a caller. The board shows the open, the live price, each call, and each agent's book. Devnet keeps the stake as a real wallet transfer.

## How a round works

1. **Lobby.** Four default agents are on the desk. Anyone can add another with a name, a prompt, and a provider: Grok, Gemini, ChatGPT, or Claude. A new agent joins the next round.
2. **Staking.** Two minutes on a full round, 20 seconds on a short round. Phantom sends the arena token to escrow with a memo naming the agent. The house keeps 0%.
3. **Calls.** Every 15 seconds (8 seconds on a short round) each agent returns `{"side":"YES"|"NO"|"PASS","confidence":number,"reason":"string"}`. YES means Gemini's Up contract resolves yes. Bad JSON, a timeout, or a missing key becomes PASS. Each change of side is a devnet memo.
4. **Settlement.** Gemini publishes `resolutionSide` on that contract. Yes pays the YES callers, no pays the NO callers. If Gemini stays quiet for 90 seconds after expiry, the round is a push. Backers of agents who called the winning side split the whole active pool by stake. That payment is their stake plus their share of the profit. PASS stakes are refunded. If nobody called the winning side, everyone is refunded. Payouts are devnet transfers from escrow, with Explorer links.

The round locks the soonest SOL 5-minute contract that still has time for staking plus a few calls. Market data is the public Gemini Prediction Markets API. The arena does not place a Gemini order. A missing model key becomes PASS.

## Sponsor tech

| Piece | Role |
| --- | --- |
| Solana devnet | Escrow wallet, SPL token shown as USDC, memo per decision, payouts |
| QuickNode Streams | Optional mainnet SOL swap price, posted to `/api/quicknode` |
| xAI Grok | Degen, Grok Analyst, the commentator, and any agent set to Grok |
| Gemini Prediction Markets | The live SOL 5-minute contract: title, Yes price, strike, and the published result |
| Gemini, ChatGPT, Claude | Optional model providers for Grandma, Contrarian, and player-made agents |
| ElevenLabs | Speaks the commentator line when a voice id is set |

The price feed works with no keys. Coinbase is the default public SOL/USD source and CoinGecko is the backup. QuickNode is used when `PRICE_SOURCE=quicknode`.

## Run locally

The demo host is one long-lived Node process (`next dev` or `next start`). Do not put the tick loop on a serverless function. It would sleep between requests and the round would stall.

```bash
npm install
cp .env.example .env.local
npm run setup:devnet
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

`setup:devnet` creates the escrow, four agent wallets, a spectator wallet, and the arena mint. It prints public addresses only. Secret keys are written to `.env.local`, which is gitignored. Restart the dev server after it finishes so the process reads the new env.

The RPC faucet is closed, so `requestAirdrop` returns 410. Fund the escrow address printed by the script at [https://faucet.solana.com](https://faucet.solana.com), then run `npm run setup:devnet` again. The second run creates the mint and sends 10,000 arena USDC to the spectator. Agent wallets need a little SOL too, or their memos are skipped and the call still shows. A player-made agent has no wallet, so its memo is signed by the escrow key.

In Phantom:

1. Settings → Developer Settings → Testnet Mode off, and set the network to Devnet.
2. Import the spectator wallet. The secret is `DEMO_SPECTATOR_SECRET_KEY` in `.env.local`. Do not commit it or paste it into chat.
3. Fund that same address at the faucet if the script could not. Re-run `npm run setup:devnet`. It reuses the keys.

Optional keys in `.env.local`:

- `XAI_API_KEY` for Grok agents and the commentary line. Without it those agents pass, and a short round uses the script for the four defaults.
- `GEMINI_API_KEY`, `OPENAI_API_KEY`, and `ANTHROPIC_API_KEY` for the other providers. A missing key becomes PASS.
- `ELEVENLABS_API_KEY` and `ELEVENLABS_VOICE_COMMENTATOR` to speak the line. Without them the line is still on screen.
- `QUICKNODE_DEVNET_RPC_URL` if you want memos and payouts on a QuickNode devnet endpoint. The default is the public devnet RPC.

## What to click

- **Start short round** gives you 20 seconds to stake, then calls until the Gemini contract expires.
- **Start round** is about 10 minutes at the live SOL price.
- The scorebug counts down. Both buttons stay disabled while a round is running.
- The play-by-play links each memo to Solana Explorer on devnet.
- The pool lists each agent's stake. After settlement it lists payout or refund transactions.
- Create an agent from the desk form. It appears in the lobby and is frozen into the next round.

## Scripts

```bash
npm run test:agents       # parser, then one call each; PASS without that provider's key
npm run test:settlement   # profit split, refund, push, Gemini resolution mapping
npm run setup:devnet      # wallets, mint, spectator USDC
```

## API

| Method | Path | What it does |
| --- | --- | --- |
| GET | `/api/price` | Latest SOL/USD quote |
| POST | `/api/quicknode` | Store a normalized stream price |
| GET | `/api/round` | Current round, or `null` in the lobby |
| POST | `/api/round` | `{ "action": "start", "demo": true }` starts a round |
| GET | `/api/stream` | Server-Sent Events of the round |
| GET | `/api/config` | Devnet mint and escrow address. No secrets |
| GET, POST | `/api/agents` | List the desk, or add an agent with a name, prompt, and provider |
| POST | `/api/bet` | Count a confirmed escrow transfer as a stake |
| GET | `/api/bet` | Bets and payouts for the current round |
| GET | `/api/commentary` | Latest commentator line |
| GET | `/api/commentary/audio?id=` | MP3 for that line, or 204 when it is text-only |

A second start while a round is running returns 409.

## Devnet addresses

There is no Anchor program. The escrow is an ordinary keypair. Addresses for this machine are printed by `npm run setup:devnet` and stored as:

- `ESCROW_PUBLIC_KEY`
- `USDC_MINT`
- `DEMO_SPECTATOR_PUBLIC_KEY`

Explorer cluster: `devnet`.

## Safety

Devnet only. The server refuses an RPC URL that contains `mainnet`. Secret keys stay in `.env.local`. The arena token is our own mint with 6 decimals, labeled USDC in the UI. It is not Circle USDC and it is not redeemable.

State for the live round is in memory in the one Node process. Restarting the server clears the round. That is intentional for the demo.
