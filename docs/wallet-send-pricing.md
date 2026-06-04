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

**Option A — Ledger wedge:**

- LI.FI quotes use `fee=0`
- Customer debit: `totalDebited = lifiFloor + marginAmount`
- Margin knob: `WALLET_SEND_MARGIN` (default **1.5%**, separate from `NOAH_PAYOUT_MARGIN`)

Option B (LI.FI integrator `fee` param) is deferred unless finance requires portal collection.

## Customer confirm rows

| Row | Direct Turnkey | LI.FI bridge |
|-----|----------------|--------------|
| Exchange rate | Hidden (USD↔USDC parity) | `customerRate` |
| You send | **R** (recipient amount) | `customerPrincipal` |
| Exchange fee | Hidden | `channelCost` |
| Processing fee | `marginAmount` (1% cap 20) | `marginAmount` |
| Network fee | Hidden | `networkFee` when applicable |
| Total debited | `totalDebited` | `totalDebited` |

Never label routes as swap/bridge/convert in customer copy.

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
