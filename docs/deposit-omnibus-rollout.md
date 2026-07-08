# Deposit omnibus + fee split rollout

Internal runbook for the flag-gated deposit omnibus flow (Noah Option 1 + Easner deposit fee / split).

## Status: Noah Standard — blocked (do not enable)

**July 2026:** Noah confirmed that under the **Standard** model (Noah’s licensing covers end customers), partners **cannot sit in the flow of funds** or hold user funds in transit. Routing remaining USDC/EURC to an Easner-controlled omnibus (then splitting to users and retaining margin) changes the onboarded flow and requires the partner’s own licensing.

| Ask | Noah | Go-live position |
|-----|------|------------------|
| Omnibus as VA destination | Rejected | Keep flags **off** |
| Inbound deduct + omnibus | Blocked by above | Keep flags **off** |
| Monthly on-ramp invoicing / fixed-fee-only | Deferred until after go-live + history | Revisit later |

**Option A (current go-live):**

- VA deposits: **no Easner fee**. Noah ChannelFee applies; credit full Noah `Remaining` to each customer’s self-custodial vault.
- Payouts: unchanged — Noah channel + FX margin in rate + **Easner 1%** processing fee from user balance.
- Code for omnibus/split may remain in the repo (flag-gated) for a possible licensed / non-Standard model later. **Never enable under Standard.**

## Feature flags

| Env | Default | Effect |
|-----|---------|--------|
| `DEPOSIT_OMNIBUS_ENABLED` | `false` | VA destination → omnibus Solana address |
| `DEPOSIT_FEE_PRICING_ENABLED` | `false` | Fee metadata + UI (`customer_fee`, `user_net`) |
| `DEPOSIT_SPLIT_ENABLED` | `false` | Defer wallet credit; run omnibus → vault split |
| `DEPOSIT_SPLIT_DRY_RUN` | `false` | Log/enqueue only; no Turnkey sends |
| `DEPOSIT_OMNIBUS_ALLOWLIST_CUSTOMER_IDS` | empty | Comma-separated Noah customer IDs for gradual rollout |

**Dependency chain**

- `DEPOSIT_FEE_PRICING_ENABLED` alone → UI/metadata only; credit unchanged (still not used for Option A go-live).
- `DEPOSIT_OMNIBUS_ENABLED` alone → Noah sends to omnibus; no user credit if split off — **must stay false**.
- `DEPOSIT_SPLIT_ENABLED` → requires `DEPOSIT_OMNIBUS_ENABLED` — **must stay false**.

Shipping with all flags `false` is the go-live configuration.

## Required env (omnibus — do not enable under Standard)

```
DEPOSIT_OMNIBUS_SOLANA_ADDRESS_USD=<parent-org Solana owner address, USDC ATA>
DEPOSIT_OMNIBUS_SOLANA_ADDRESS_EUR=<parent-org Solana owner address, EURC ATA>
WALLET_SEND_FEE_SOLANA_ADDRESS_USD=<Easner payout fee wallet>
WALLET_SEND_FEE_SOLANA_ADDRESS_EUR=<Easner payout fee wallet>
```

Payout fee wallets remain required for outbound 1% capture. Omnibus address vars are unused while flags are off.

## Database

`business/scripts/sql/deposit-split-jobs-schema.sql` only needed if/when `DEPOSIT_SPLIT_ENABLED` is turned on (licensed model). Not required for Option A.

## Turnkey omnibus setup (parent org)

Historical / future licensed-model notes only. Skip for Option A go-live.

1. **Organization:** Use parent org (`TURNKEY_ORGANIZATION_ID`). Sub-org wallets cannot be signed from the parent API key.
2. **Create wallet:** Dashboard → Wallets → Create → name `Easner deposit omnibus` → add Solana account → copy address → `DEPOSIT_OMNIBUS_SOLANA_ADDRESS_USD`.
3. **EUR account:** `createWalletAccounts` on the same `walletId` with path index 1 (index 0 = USDC, 1 = EURC) → `DEPOSIT_OMNIBUS_SOLANA_ADDRESS_EUR`.
4. **ATAs:** Run `ensureStablecoinTokenAccountOnChain` for USDC on the USD address and EURC on the EUR address.
5. **API user + policies:** Create `easner-deposit-splitter` API user in parent org. Policies (deny-by-default) allow SPL sends from the omnibus wallet only to `WALLET_SEND_FEE_*` and user vault addresses.
6. **Balance webhooks:** Subscribe both omnibus addresses to Turnkey balance webhooks (same infra as `/api/internal/turnkey-balance-webhook-endpoint`).

## Noah coordination

**Option A / Standard (current):**

1. Confirm VA `DestinationAddress` = **each customer’s Turnkey vault** (never Easner omnibus).
2. Re-provision any pilot customers that were temporarily bound to omnibus back to their user vault (see below).
3. Do **not** request inbound omnibus deduct or monthly on-ramp invoicing for go-live; revisit post go-live per Noah.

### Re-provision virtual accounts (rollback to user vault)

After turning omnibus flags **off**, force re-bind so Noah destination returns to the user vault.

```bash
cd business

# Dry-run: destination must be user vault (not omnibus pubkeys)
npx tsx scripts/reprovision-bank-onramp-va.ts \
  --noah-customer-id eind_... --dry-run

# Live re-bind USD + EUR
npx tsx scripts/reprovision-bank-onramp-va.ts \
  --noah-customer-id eind_...

# Or by user / business id
npx tsx scripts/reprovision-bank-onramp-va.ts --user-id <uuid>
npx tsx scripts/reprovision-bank-onramp-va.ts --business-id <uuid>
```

**Office admin API:** `POST /api/admin/ops/reprovision-bank-onramp-va` (staff JWT) with body:

```json
{
  "businessId": "<uuid>",
  "rails": "both",
  "dryRun": false
}
```

**Verify:** Noah dashboard / dry-run output shows destination = user vault pubkey (not omnibus).

## Flow summary (Option A — flags off)

1. Fiat deposit → Noah fiat→crypto settlement (`ChannelFee` deducted by Noah).
2. `Remaining` lands on the **customer’s** Solana vault.
3. Orchestration Out / vault inbound → credit `wallet_balances` for full Remaining (no Easner deposit fee).

## Flow summary (omnibus — archived; do not enable)

1. Fiat deposit → Remaining to omnibus.
2. Split job: `user_net` → user vault; `easner_margin` → fee wallet.
3. Requires licensed FoF model — blocked under Standard.

Cron `/api/cron/process-deposit-splits` only matters if split is enabled; with flags off it no-ops.

## Ops monitoring

`GET /api/admin/ops/rail-health` exposes:

- `deposit_omnibus.*` — expect `omnibus_enabled: false`, `split_enabled: false` for go-live
- `global_payouts.failed_without_reversal` — failed payouts where wallet debit was not reversed (should be 0)

Cron jobs:

- `/api/cron/process-deposit-splits` (every 2 min) — no-op when split disabled
- `/api/cron/process-global-payout-reversal-repair` (every 15 min) — retry failed payout debit reversals

See also [payout-economics-rollout.md](./payout-economics-rollout.md) for corridor limits and economics probes.

## Test matrix

| Case | Flags | Expected |
|------|-------|----------|
| **Option A go-live** | all off | VA → user vault; full Remaining credited; no Easner deposit fee line |
| Pricing only | `FEE_PRICING` on | Fee/net in UI only; credit unchanged (not used for go-live) |
| Omnibus / split | any omnibus/split on | **Do not run** under Standard |

## Rollback from omnibus pilot

1. Set `DEPOSIT_SPLIT_ENABLED=false` and `DEPOSIT_OMNIBUS_ENABLED=false` (and fee pricing off for Option A).
2. Re-provision VAs for affected customers → user vault.
3. Leave any `deposit_split_jobs` for ops review; do not delete in-flight jobs without reconciliation.

## Go-live checklist (Option A)

- [ ] All `DEPOSIT_OMNIBUS_*` / `DEPOSIT_SPLIT_*` / `DEPOSIT_FEE_PRICING_ENABLED` **false** in local + Vercel
- [ ] Pilot VAs re-provisioned to **user vault** (confirm destination ≠ omnibus)
- [ ] `rail-health` shows `omnibus_enabled: false`, `split_enabled: false`
- [ ] `rail-health` shows `global_payouts.failed_without_reversal: 0`
- [ ] VA deposit credits full Noah Remaining (legacy path)
- [ ] Payout economics unchanged (Easner 1% + existing Noah/FX)
- [ ] Payout economics probe / corridor schemas as needed ([payout-economics-rollout.md](./payout-economics-rollout.md))
- [ ] Noah reply sent acknowledging Standard FoF constraint and Option A
