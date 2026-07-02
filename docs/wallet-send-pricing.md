# Wallet send pricing

Balance-funded crypto wallet sends use a **two-layer** model parallel to [noah-rates-pricing.md](./noah-rates-pricing.md).

## Customer journey (amount → review)

| Screen | What the user sees |
|--------|-------------------|
| **Amount** | Receive-entry only: user enters the destination token amount (e.g. `10 USDT`). No rate line, no converted send preview, no `crypto_rates` fetch. |
| **Review transfer** | Live wallet send quote (`POST /api/wallets/send/quote`): rate, you send, recipient gets, total debited. |
| **Confirm / execute** | Same live quote economics as review (unchanged). |

Background quote prefetch on the amount screen warms Continue when the user enters a valid receive amount. On wallet + Noah payout balance paths, Continue disables immediately on tap; an in-button spinner appears only if quote preparation is still in flight after ~175ms.

## Layers

| Layer | Source | Used on |
|-------|--------|---------|
| Static mins | `wallet-send-limits` (`customerRate: 1` conservative) | Amount screen min validation |
| Execution | Live wallet send quote (`POST /api/wallets/send/quote`) | Review transfer + execute (+ warm prefetch for Continue) |
| `crypto_rates` (DB) | LI.FI probe + margin sync | **Not** used in wallet send amount UI; optional ops / quote API follow-up |

## Direct Turnkey (USDC/Sol, EURC/Sol)

**1:1 transfer + explicit processing fee** (no FX row in confirm UI):

- Recipient receives **R** USDC/EURC on-chain.
- Processing fee = `R × WALLET_SEND_PROCESSING_FEE_BPS/10000` (default **1%**, **uncapped** — `WALLET_SEND_PROCESSING_FEE_CAP` defaults to ∞).
- Ledger debit = **R + fee** from USD/EUR balance.
- On-chain: SPL **R** → recipient; SPL **fee** → `WALLET_SEND_FEE_SOLANA_ADDRESS_*` (not Noah workflow addresses, not `PLATFORM_LIQUIDITY_POOL_*`).
- Quotes use `computeDirectTurnkeyWalletSendPricing` in `@easner/shared` — **not** `crypto_rates.customerRate`. Here `processingFee === marginAmount` (there is no separate FX margin).

## LI.FI bridge corridors

**Split on-chain (same invariant as direct Turnkey), now with an explicit 1% leg:**

- LI.FI quotes use `fee=0`
- **Execution pricing** uses **ticket-sized mid** from the live quote (`toAmount / fromAmount`), not only the ~$100 DB `lifi_mid` (same idea as Noah payout `noahImpliedProviderRate` at prepare floor). Stale DB mid at small tickets (notably USDT/Tron) otherwise inflates the route cost.
- **Balance debit:** `totalDebited = lifiFloor + marginAmount + processingFee`, where `processingFee = 1% × customerPrincipal` (uncapped) and `marginAmount` is the hidden 0.5% FX spread already baked into `customerRate`.
- **On-chain out = `totalDebited`:** Turnkey broadcasts LI.FI tx (`lifiFloor` into the bridge) **then** a single SPL `marginAmount + processingFee` → `WALLET_SEND_FEE_SOLANA_ADDRESS_*`. Ledger debits only after both succeed; fee SPL failure returns `margin_capture_failed` (no balance debit).
- Pre-execute: ledger available ≥ `totalDebited` and vault USDC/EURC ≥ `lifiFloor + marginAmount + processingFee`.
- **0.5% margin** (`WALLET_SEND_MARGIN`) stays hidden in `customerRate`; the **explicit 1% processing fee is shown** on confirm (combined with the bridge route cost in a single **Processing fee** row via `computeDisplayProcessingFee`).

### Send vs receive entry (LI.FI execution)

On the **amount screen**, wallet sends are **receive-entry only** (user enters destination token amount). Send-budget entry remains available via route/deep link for later; there is no toggle on the amount UI.

At **execution** (quote API / confirm), both modes are still supported for pricing:

| Mode | User enters | LI.FI sizing | Canonical receive on quote |
|------|-------------|--------------|----------------------------|
| **Send** | USD/EUR send budget | Fixed `fromAmount = sendBudget` (no slippage bump) | Live LI.FI `toAmount` |
| **Receive** | Destination amount | Binary search **minimum** `fromAmount` meeting target ± slippage | User-entered receive target |

**Execute re-quote:** quote time persists `lifi_from_amount_raw` on `wallet_send_sessions`. After PIN, execute calls LI.FI **once** with that `fromAmount` (fresh `transactionRequest`), then floor + receive-target checks. Legacy sessions without the column fall back to full binary search.

Send $10 and receive 8 USDT should converge on the same live quote when the route delivers ~8 USDT for ~$10 USDC in. Small-ticket Sol→Tron is **not** 1:1 (send $10 ≠ receive 10 USDT on Tron); review uses live quote economics, not planning `crypto_rates`.

Option B (LI.FI integrator `fee` param) is deferred unless finance requires portal collection.

## Customer confirm rows

Canonical order for both business and mobile: **Sending → Processing fee → Exchange rate (cross-currency only) → Total debited → Recipient gets → Recipient → Transfer method → When → Note**.

| Row | Direct Turnkey | LI.FI bridge |
|-----|----------------|--------------|
| Sending | **R** (recipient amount) | `customerPrincipal` (includes hidden 0.5% FX spread vs mid) |
| Processing fee | `processingFee` (1% uncapped) | `computeDisplayProcessingFee` = **1% leg + route cost** (`lifiFloor − midNotional`) |
| Exchange rate | Hidden (USD↔USDC parity) | `customerRate` (0.5% margin already in rate) |
| Total debited | `totalDebited` | `totalDebited` (= Sending + Processing fee) |
| Recipient gets | **R** | **R** |

No standalone **Exchange fee** row — the bridge route cost is folded into **Processing fee**. Network fee is hidden (Turnkey-sponsored Solana gas). Never label routes as swap/bridge/convert in customer copy.

**Product rule:** the hidden FX margin stays baked into the quoted rate (Noah global fiat, LI.FI bridge); the explicit **1% processing fee is always shown** (except Easetag, which is free) as a single combined Processing fee row. `Total debited = Sending + Processing fee`. See [noah-rates-pricing.md](./noah-rates-pricing.md).

## Env

```bash
WALLET_SEND_ENABLED=true

# Processing fee (all wallet sends). Uncapped: leave CAP unset (defaults to ∞).
WALLET_SEND_PROCESSING_FEE_BPS=100
# WALLET_SEND_PROCESSING_FEE_CAP=   # unset = uncapped
WALLET_SEND_FEE_SOLANA_ADDRESS_USD=
WALLET_SEND_FEE_SOLANA_ADDRESS_EUR=

# LI.FI bridge FX margin only (matches Noah's 0.5% now that the 1% fee is explicit)
WALLET_SEND_MARGIN=0.005
LIFI_API_KEY=
LIFI_INTEGRATOR=easner
CRYPTO_RATES_PROBE_SOL_ADDRESS=
CRYPTO_RATES_REFRESH_TTL_MS=300000
# WALLET_SEND_ENABLED_CORRIDORS=USDC:Solana,EURC:Solana
```

### Refresh cadence

| Mechanism | Default | Config |
|-----------|---------|--------|
| Background refresh TTL | **5 min** | `CRYPTO_RATES_REFRESH_TTL_MS` (business env) |
| Background sync on read | When older than TTL | `GET /api/fx/crypto-rates` triggers `syncCryptoRatesSafe` |
| Vercel cron | **Every 5 min** | `/api/cron/sync-crypto-rates` in `business/vercel.json` |
| Office / CLI | Manual | Platform Control → Sync rates, or `scripts/sync-crypto-rates.ts` |

## Office admin

Platform control → **Crypto rates**: LI.FI corridors only; direct Turnkey rows are optional display (`source=direct_turnkey`) and are **not** used for customer wallet send amount UI.

Apply migration: `business/supabase/migrations/20250530130000_crypto_rates_v1.sql`

## Ops: pricing table script

Print confirm-style rows (recipient / you send / exchange / processing / network / total debited / lifi floor) for every enabled corridor:

```bash
cd business && node --env-file=.env.local --import tsx scripts/probe-lifi-wallet-send-pricing.ts
cd business && RECEIVE_AMOUNT=50 node --env-file=.env.local --import tsx scripts/probe-lifi-wallet-send-pricing.ts
cd business && SOURCE_CURRENCY=EUR RECEIVE_AMOUNT=100 node --env-file=.env.local --import tsx scripts/probe-lifi-wallet-send-pricing.ts
```

Requires `CRYPTO_RATES_PROBE_SOL_ADDRESS` (same Solana vault as crypto rate sync). LI.FI rows call the live quote API (`fee=0`); direct Turnkey uses env processing fee bps/cap.
