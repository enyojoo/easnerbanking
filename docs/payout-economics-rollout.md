# Payout economics and corridor limits rollout

Companion to [deposit-omnibus-rollout.md](./deposit-omnibus-rollout.md) for global fiat payouts (Noah prepare + Easner 1% processing fee).

**Deposit fees:** Under Noah Standard, deposit omnibus/split is **blocked**. Go-live (Option A) = **no Easner VA inbound fee**; this doc covers **payout** economics only.

## Payout pricing (rate drift)

- The **amount screen** preview uses `noah_rates` from the database (customer rate ≈ mid − FX margin).
- **Continue → quote** runs live Noah `sell/prepare` and recomputes with ticket-sized mid (`buildPayoutQuote`). That quote is **binding** for confirm.
- Quote sessions expire after ~15 minutes (`isPayoutQuoteFresh`). User must tap Continue again for a fresh quote.
- **No revenue leak on drift:** wallet debit uses prepare-time economics; if prepare fails at quote, the user is not debited.

## Channel min/max

- UI limits use `payout_corridors.fields_schema.limits` (synced from Noah channel `MinLimit` / `MaxLimit`).
- Noah may still reject at prepare with stricter ticket limits → `mapNoahPayoutUserError` surfaces channel-limit copy.
- **Send-entry mode:** over-max errors show max in send currency (USD/EUR) via `validatePayoutAmountAgainstLimitsForEntry`.

### Sync corridor schemas from Noah

```bash
cd business && node --env-file=.env.local --import tsx scripts/apply-payout-corridor-schemas.ts
```

### Probe prepare limits (binary search max receive)

```bash
cd business && node --env-file=.env.local --import tsx scripts/probe-corridor-prepare-limits.ts
# Optional: patch DB max when probe finds a lower cap
cd business && node --env-file=.env.local --import tsx scripts/probe-corridor-prepare-limits.ts --write-db
```

Output: `docs/corridor-prepare-limits.json`

## Economics probe (pre-rollout)

Save **one real recipient per currency** (KES, GHS, ZAR, USD domestic; NGN/IDR already validated), then:

```bash
cd business && node --env-file=.env.local --import tsx scripts/probe-all-payout-economics.ts
```

Env:

- `PROBE_USE_USER_RECIPIENTS=1` (default) — prefer saved recipients over synthetic fixtures
- `PROBE_SEND_BUDGETS=100,500,1000,5000`
- `PROBE_SOURCES=USD,EUR`

Pass criteria per corridor: `ok && footingOk`; 1% processing leg; `totalDebited = sending + processingFeeUI`.

Output: `docs/payout-economics-probe.json`

## Execute-time failure

- Failed payout execute calls `reverseGlobalPayoutWalletDebitForEasnerPayoutId` (balance restored).
- Cron `/api/cron/process-global-payout-reversal-repair` (every 15 min) retries stuck reversals.
- `GET /api/admin/ops/rail-health` → `global_payouts.failed_without_reversal` should stay **0**.

## Go-live checklist (payouts)

- [ ] `apply-payout-corridor-schemas` run in staging/prod
- [ ] Real recipients saved for KES, GHS, ZAR, USD
- [ ] `probe-all-payout-economics` green for enabled corridors
- [ ] `probe-corridor-prepare-limits` recorded in `docs/corridor-prepare-limits.json`
- [ ] `rail-health` → `global_payouts.failed_without_reversal: 0`
