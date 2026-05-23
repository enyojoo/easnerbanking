# Platform control (Office)

Office **Platform control** (`/platform-control`) configures balance hold, **manual** cross-border send (rates + pay-in), and **automated** send catalogs (provider corridors and crypto).

**Manual send (“Through another currency”)** is documented in [manual-send-through-another-currency.md](./manual-send-through-another-currency.md).

## Tabs

| Tab | Query | Purpose |
|-----|-------|---------|
| Platform | `?tab=platform` | Maintenance, registration, reporting base currency, **global currency controls** (hold), **security** |
| Rates | `?tab=rates` | **Manual send:** pricing for **fiat and stablecoins** — `exchange_rates`, fees, limits, `can_send` / `can_receive` (add USDC on Rates, not only on Crypto) |
| Payment methods | `?tab=payment-methods` | **Manual send:** pay-in per currency (bank, QR, stablecoin wallet, …); required for a code to appear in “Through another currency” |
| Fiat | `?tab=fiat` | **Automated send only:** payout corridors (Noah, Yellowcard, …) via `payout_corridors` |
| Crypto | `?tab=crypto` | **Automated send only:** wallet/crypto destinations via `crypto_destinations` |

Removed tabs (`currencies`, `settings`, `corridors`, `noah`, `balance-currencies`, …) are not redirected except `balance-currencies` → **Platform** and `send-destinations` → **Fiat**; unknown `?tab=` values fall back to **Platform**.

## Manual vs automated (important)

| Question | Answer |
|----------|--------|
| What populates **Through another currency** (send/pay-in)? | Any **fiat or stablecoin** that is an active **`from_currency` on Rates** and has an active **`payment_methods`** row (e.g. USDC on Rates + USDC stablecoin pay-in — not from Crypto tab). |
| What do **Fiat** / **Crypto** tabs control? | **Automated** provider flows only (`GET /api/send-destinations`, Noah/Yellowcard routing). |
| What can users hold? | Platform → Global currency controls (`currency_available_*` / `currency_active_*`). |

## Provider routing (automated)

- `payout_corridors.providers` — mobile network labels in UI.
- `payout_corridors.provider_routing` — ordered backends, e.g. Noah first.
- Runtime router: `business/lib/payout-providers/`.

## Legacy “Currencies” tab

Legacy toggles migrate via:

```bash
node --env-file=.env.local --import tsx scripts/migrate-legacy-currency-catalog.ts
```

## Seeding

**Rates tab** needs both tables (run in Supabase SQL editor or `supabase db push`):

1. `20250526000000_platform_control_currencies_exchange_rates.sql` — creates `currencies` + `exchange_rates`, seeds currency catalog (USD, EUR, KES, USDC, …)
2. `20250525120000_manual_send_currency_codes.sql` — optional widen `code` / currency columns to `varchar(8)` if not already applied
3. `20250526120000_seed_exchange_rates_ciuna.sql` — upserts 156 Ciuna rate rows

If `exchange_rates` is already populated but `currencies` was missing, applying (1) then opening Rates (or **Sync rates**) is enough; the admin API also bootstraps missing currency rows from rate codes on first load.

## Exchange rate sync (P2P model)

All live rate updates use the **Easner P2P pricing model** (`@easner/rate-sync`), not Open Exchange Rates. Sync recomputes `rate`, `source` (`p2p_sync`), and `as_of` for every **existing** `exchange_rates` row; it does not create new corridor pairs (seed those via migration or Office edit).

| Trigger | Endpoint |
|---------|----------|
| Office **Sync rates** | `POST /api/admin/exchange-rates/sync` (staff JWT) |
| Daily cron (Vercel) | `GET /api/cron/sync-exchange-rates` — `0 1 * * *` |
| Stale USD/EUR dashboard read | Background P2P sync when `as_of` is older than `FX_RATES_REFRESH_TTL_MS` (default 24h) |

Office **Sync rates** runs the P2P model then reloads the table.

Local dry-run: `npm run sync:debug -w @easner/rate-sync` (see [easner-p2p-pricing-model.md](./easner-p2p-pricing-model.md)).

```bash
cd business
# Alternative to (3): import Ciuna INSERT via script:
# node --env-file=.env.local --import tsx scripts/import-ciuna-exchange-rates.ts scripts/data/ciuna-exchange-rates.insert.sql

node --env-file=.env.local --import tsx scripts/seed-payout-corridors.ts
SEED_CORRIDORS_ENABLED=true node --env-file=.env.local --import tsx scripts/seed-payout-corridors.ts
node --env-file=.env.local --import tsx scripts/seed-crypto-destinations.ts
SEED_CRYPTO_ENABLED=true node --env-file=.env.local --import tsx scripts/seed-crypto-destinations.ts
node --env-file=.env.local --import tsx scripts/migrate-legacy-currency-catalog.ts
```

## Client API

- `GET /api/send-destinations?annotateProviders=true` — **automated** catalog (Business + Mobile).
- Manual send uses `GET /api/manual-send/catalog`, `POST /api/fx/manual-quote`, `GET /api/payment-methods?for=manual_send`, and `POST /api/manual-send/orders` (see [manual-send-through-another-currency.md](./manual-send-through-another-currency.md)).

## Noah ops scripts

```bash
node --env-file=.env.local --import tsx scripts/probe-noah-pairs.ts
node --env-file=.env.local --import tsx scripts/list-noah-blocked-corridors.ts
```
