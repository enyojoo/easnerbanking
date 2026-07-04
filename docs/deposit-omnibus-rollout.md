# Deposit omnibus + fee split rollout

Internal runbook for the flag-gated deposit omnibus flow (Noah Option 1 + Easner 1% min/max fee).

## Feature flags

| Env | Default | Effect |
|-----|---------|--------|
| `DEPOSIT_OMNIBUS_ENABLED` | `false` | VA destination → omnibus Solana address |
| `DEPOSIT_FEE_PRICING_ENABLED` | `false` | Fee metadata + UI (`customer_fee`, `user_net`) |
| `DEPOSIT_SPLIT_ENABLED` | `false` | Defer wallet credit; run omnibus → vault split |
| `DEPOSIT_SPLIT_DRY_RUN` | `false` | Log/enqueue only; no Turnkey sends |
| `DEPOSIT_OMNIBUS_ALLOWLIST_CUSTOMER_IDS` | empty | Comma-separated Noah customer IDs for gradual rollout |

**Dependency chain**

- `DEPOSIT_FEE_PRICING_ENABLED` alone → UI/metadata only; credit unchanged.
- `DEPOSIT_OMNIBUS_ENABLED` alone → Noah sends to omnibus; no user credit if split off.
- `DEPOSIT_SPLIT_ENABLED` → requires `DEPOSIT_OMNIBUS_ENABLED`.

Shipping with all flags `false` is safe. Toggling flags off rolls back without redeploy.

## Required env (when omnibus live)

```
DEPOSIT_OMNIBUS_SOLANA_ADDRESS_USD=<parent-org Solana owner address, USDC ATA>
DEPOSIT_OMNIBUS_SOLANA_ADDRESS_EUR=<parent-org Solana owner address, EURC ATA>
WALLET_SEND_FEE_USD=<Easner margin destination, USD>
WALLET_SEND_FEE_EUR=<Easner margin destination, EUR>
```

Optional: `DEPOSIT_OMNIBUS_ALLOWLIST_CUSTOMER_IDS` for staged rollout.

## Database

Apply `business/scripts/sql/deposit-split-jobs-schema.sql` before enabling `DEPOSIT_SPLIT_ENABLED`.

## Turnkey omnibus setup (parent org)

1. **Organization:** Use parent org (`TURNKEY_ORGANIZATION_ID`). Sub-org wallets cannot be signed from the parent API key.
2. **Create wallet:** Dashboard → Wallets → Create → name `Easner deposit omnibus` → add Solana account → copy address → `DEPOSIT_OMNIBUS_SOLANA_ADDRESS_USD`.
3. **EUR account:** `createWalletAccounts` on the same `walletId` with path index 1 (index 0 = USDC, 1 = EURC) → `DEPOSIT_OMNIBUS_SOLANA_ADDRESS_EUR`.
4. **ATAs:** Run `ensureStablecoinTokenAccountOnChain` for USDC on the USD address and EURC on the EUR address.
5. **API user + policies:** Create `easner-deposit-splitter` API user in parent org. Policies (deny-by-default) allow SPL sends from the omnibus wallet only to `WALLET_SEND_FEE_*` and user vault addresses.
6. **Balance webhooks:** Subscribe both omnibus addresses to Turnkey balance webhooks (same infra as `/api/internal/turnkey-balance-webhook-endpoint`).
7. **Staging:** Enable flags on the deploy environment; set `DEPOSIT_OMNIBUS_ALLOWLIST_CUSTOMER_IDS` to internal test Noah customer IDs only.

## Noah coordination

Before go-live:

1. Confirm Noah orchestration `DestinationAddress` for bank on-ramp VAs points to omnibus addresses (not user vaults) for customers on the new flow.
2. **Re-provision VAs** for each pilot customer (existing or new) — see below.
3. Send Noah the follow-up in the implementation plan (Option 1 inbound, Easner min/max in UX only, monthly on-ramp invoicing on trust).
4. Run the E2E matrix below after re-provision.

### Re-provision virtual accounts (existing + new customers)

First-time provisioning only runs when no VA exists. **Existing KYC'd customers** need a **force re-provision** after omnibus env + flags are set.

**Prerequisites:** `DEPOSIT_OMNIBUS_ENABLED=true`, omnibus addresses in env, customer on `DEPOSIT_OMNIBUS_ALLOWLIST_CUSTOMER_IDS` (if using allowlist).

**CLI (staging/prod with service role + Noah env):**

```bash
cd business

# Dry-run: show destination only (omnibus vs vault)
npx tsx scripts/reprovision-bank-onramp-va.ts --business-id <uuid> --dry-run

# Re-bind USD + EUR workflows to current destination
npx tsx scripts/reprovision-bank-onramp-va.ts --business-id <uuid>

# Or by user / Noah customer id
npx tsx scripts/reprovision-bank-onramp-va.ts --user-id <uuid>
npx tsx scripts/reprovision-bank-onramp-va.ts --noah-customer-id ebiz_<hex>
npx tsx scripts/reprovision-bank-onramp-va.ts --business-id <uuid> --rails usd
```

**Office admin API:** `POST /api/admin/ops/reprovision-bank-onramp-va` (staff JWT) with body:

```json
{
  "businessId": "<uuid>",
  "rails": "both",
  "dryRun": false
}
```

**New customers:** If omnibus flags are on **before** their first VA is created, normal KYC → Accounts provisioning uses omnibus automatically. If they were provisioned earlier, run the same re-provision script.

**Verify:** Noah dashboard shows workflow destination = omnibus pubkey; sandbox deposit lands on omnibus in Solscan.

## Flow summary

1. Fiat deposit → Noah fiat→crypto settlement (`ChannelFee` deducted; `Remaining` to omnibus).
2. Orchestration Out webhook and/or omnibus Turnkey balance webhook → `triggerDepositSplit` (synchronous).
3. Turnkey send: `user_net` → user vault; optional `easner_margin` → `WALLET_SEND_FEE_*`.
4. User vault inbound webhook → credit `wallet_balances` + push/email (if not already credited after poll).

Cron `/api/cron/process-deposit-splits` (every 2 min) retries stuck `pending` / `send_submitted` jobs.

## Ops monitoring

`GET /api/admin/ops/rail-health` exposes:

- `deposit_omnibus.*` — flag states, omnibus addresses, pending/stuck split jobs, `blocked_negative_margin_count` (last 30d)
- `global_payouts.failed_without_reversal` — failed payouts where wallet debit was not reversed (should be 0)

Cron jobs:

- `/api/cron/process-deposit-splits` (every 2 min) — retry stuck split jobs
- `/api/cron/process-global-payout-reversal-repair` (every 15 min) — retry failed payout debit reversals

See also [payout-economics-rollout.md](./payout-economics-rollout.md) for corridor limits and economics probes.

## Test matrix (staging)

| Case | Flags | Expected |
|------|-------|----------|
| Legacy | all off | VA → user vault; full Remaining credited; no fee line |
| Pricing only | `FEE_PRICING` on | Fee/net in UI; credit unchanged |
| Dry run | omnibus + split + `DRY_RUN` | Job enqueued; no sends; no credit |
| Happy path $100 ACH | all on | UI fee $3; credit $97; push after vault settle |
| Min fee edge $50 | all on | Fee $3; credit $47 |
| Max fee edge $1000 | all on | Fee $10; credit $990 |
| Negative margin guard | simulate high ChannelFee | Split blocked; `deposit_split_status: blocked_negative_margin`; lifecycle shows “We're reviewing this deposit” |

## Rollback

1. Set `DEPOSIT_SPLIT_ENABLED=false` (stops new splits; credits revert to legacy path on next deploy path only for new deposits).
2. Set `DEPOSIT_OMNIBUS_ENABLED=false` (new VAs → user vault).
3. Re-provision VAs for affected customers.
4. Leave `deposit_split_jobs` rows for ops review; do not delete in-flight jobs without manual reconciliation.

## Go-live checklist

- [ ] SQL migration applied
- [ ] Turnkey omnibus wallet + ATAs + policies + webhooks
- [ ] Env addresses set in production
- [ ] Noah omnibus destination confirmed
- [ ] VAs re-provisioned for pilot customers
- [ ] `rail-health` shows `split_config_valid: true`
- [ ] `rail-health` shows `blocked_negative_margin_count: 0` and `global_payouts.failed_without_reversal: 0`
- [ ] Staging E2E matrix passed
- [ ] Payout economics probe passed ([payout-economics-rollout.md](./payout-economics-rollout.md))
- [ ] `apply-payout-corridor-schemas` run
- [ ] Enable flags (allowlist first, then full rollout)
