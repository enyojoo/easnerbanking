# Wallet send pricing

Balance-funded crypto wallet sends use a **two-layer** model parallel to [noah-rates-pricing.md](./noah-rates-pricing.md).

## Layers

| Layer | Source | Used on |
|-------|--------|---------|
| Planning | `crypto_rates` (LI.FI probe + margin) | LI.FI bridge send amount preview |
| Execution | Live wallet send quote (`POST /api/wallets/send/quote`) | Confirm + execute |

## Direct Turnkey (USDC/Sol, EURC/Sol)

**1:1 transfer + explicit processing fee** (no FX row in confirm UI):

- Recipient receives **R** USDC/EURC on-chain.
- Processing fee = `min(R × WALLET_SEND_PROCESSING_FEE_BPS/10000, WALLET_SEND_PROCESSING_FEE_CAP)` (defaults: **1%**, cap **20**).
- Ledger debit = **R + fee** from USD/EUR balance.
- On-chain: SPL **R** → recipient; SPL **fee** → `WALLET_SEND_FEE_SOLANA_ADDRESS_*` (not Noah workflow addresses, not `PLATFORM_LIQUIDITY_POOL_*`).
- Quotes use `computeDirectTurnkeyWalletSendPricing` in `@easner/shared` — **not** `crypto_rates.customerRate`.

## LI.FI bridge corridors

**Split on-chain (same invariant as direct Turnkey):**

- LI.FI quotes use `fee=0`
- **Balance debit:** `totalDebited = lifiFloor + marginAmount = customerPrincipal + routeCost`
- **On-chain out = `totalDebited`:** Turnkey broadcasts LI.FI tx (`lifiFloor` into the bridge) **then** SPL `marginAmount` → `WALLET_SEND_FEE_SOLANA_ADDRESS_*`. Ledger debits only after both succeed; margin SPL failure returns `margin_capture_failed` (no balance debit).
- Pre-execute: ledger available ≥ `totalDebited` and vault USDC/EURC ≥ `lifiFloor + marginAmount`.
- **1.5% margin** (`WALLET_SEND_MARGIN`) is in `customerRate`; do **not** show a separate “Processing fee” on confirm for LI.FI (margin is in rate / you-send principal; captured on-chain to the fee wallet).

Option B (LI.FI integrator `fee` param) is deferred unless finance requires portal collection.

## Customer confirm rows

| Row | Direct Turnkey | LI.FI bridge |
|-----|----------------|--------------|
| Exchange rate | Hidden (USD↔USDC parity) | `customerRate` (margin already in rate) |
| You send | **R** (recipient amount) | `customerPrincipal` (includes Easner margin vs mid) |
| Exchange fee | Hidden | `routeCost` (`lifiFloor − midNotional`, bridge/slippage) |
| Processing fee | `marginAmount` (1% cap 20) | **Hidden** (in rate / you send) |
| Network fee | Hidden (Turnkey-sponsored Solana gas; not a user charge) | — |
| Total debited | `totalDebited` | `totalDebited` (= you send + exchange fee) |

Never label routes as swap/bridge/convert in customer copy.

**Product rule:** margin baked into quoted rate → hide processing row (Noah global fiat, LI.FI bridge); explicit 1:1 fee on top → show it (direct Turnkey Solana). See [noah-rates-pricing.md](./noah-rates-pricing.md).

## Env

```bash
WALLET_SEND_ENABLED=true

# Direct Turnkey processing fee (Solana stables)
WALLET_SEND_PROCESSING_FEE_BPS=100
WALLET_SEND_PROCESSING_FEE_CAP=20
WALLET_SEND_FEE_SOLANA_ADDRESS_USD=
WALLET_SEND_FEE_SOLANA_ADDRESS_EUR=

# LI.FI bridge margin only
WALLET_SEND_MARGIN=0.015
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

Platform control → **Crypto rates**: LI.FI corridors only; direct Turnkey rows are optional display (`source=direct_turnkey`) and are **not** used for quotes.

Apply migration: `business/supabase/migrations/20250530130000_crypto_rates_v1.sql`

## Ops: pricing table script

Print confirm-style rows (recipient / you send / exchange / processing / network / total debited / lifi floor) for every enabled corridor:

```bash
cd business && node --env-file=.env.local --import tsx scripts/probe-lifi-wallet-send-pricing.ts
cd business && RECEIVE_AMOUNT=50 node --env-file=.env.local --import tsx scripts/probe-lifi-wallet-send-pricing.ts
cd business && SOURCE_CURRENCY=EUR RECEIVE_AMOUNT=100 node --env-file=.env.local --import tsx scripts/probe-lifi-wallet-send-pricing.ts
```

Requires `CRYPTO_RATES_PROBE_SOL_ADDRESS` (same Solana vault as crypto rate sync). LI.FI rows call the live quote API (`fee=0`); direct Turnkey uses env processing fee bps/cap.
