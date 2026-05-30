# Wallet send pricing

Balance-funded crypto wallet sends use a **two-layer** model parallel to [noah-rates-pricing.md](./noah-rates-pricing.md).

## Layers

| Layer | Source | Used on |
|-------|--------|---------|
| Planning | `crypto_rates` (LI.FI probe + margin) | Send amount preview |
| Execution | Live wallet send quote (`POST /api/wallets/send/quote`) | Confirm + execute |

## Margin capture (v1 — Option A)

**Option A — Ledger wedge (chosen for v1):**

- LI.FI quotes use `fee=0`
- Customer debit: `totalDebited = lifiFloor + marginAmount`
- Margin knob: `WALLET_SEND_MARGIN` (default **1.5%**, separate from `NOAH_PAYOUT_MARGIN`)

Option B (LI.FI integrator `fee` param) is deferred unless finance requires portal collection.

## Customer confirm rows

| Row | Field |
|-----|--------|
| Exchange rate | `customerRate` |
| You send | `customerPrincipal` / `sendAmount` |
| Exchange fee | `routeCost` / `channelCost` (includes LI.FI 25 BPS + bridge spread) |
| Processing fee | `marginAmount` |
| Network fee | `networkFee` |
| Total debited | `totalDebited` |

Never label routes as swap/bridge/convert in customer copy.

## Direct corridors

USDC/Sol and EURC/Sol use Turnkey direct send: `lifi_mid = 1`, exchange fee ≈ 0.

## Env

```bash
WALLET_SEND_ENABLED=true
WALLET_SEND_MARGIN=0.015
LIFI_API_KEY=
LIFI_INTEGRATOR=easner
CRYPTO_RATES_PROBE_SOL_ADDRESS=
CRYPTO_RATES_REFRESH_TTL_MS=300000
# Optional: restrict live corridors (omit = all v1 pairs enabled)
# WALLET_SEND_ENABLED_CORRIDORS=USDC:Solana,EURC:Solana
```

## Office admin

Platform control → **Crypto rates** (`/platform-control?tab=crypto-rates`): view corridors, **Sync rates** (LI.FI probe → `crypto_rates`), manual overrides (`source=office`).

Apply migration: `business/supabase/migrations/20250530130000_crypto_rates_v1.sql`
