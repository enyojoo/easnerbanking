# Balance payout UX runbook (lock-on-review)

> **See also:** [lock-on-review-ux-guide.md](./lock-on-review-ux-guide.md) — master comparison table and sequence diagrams for all flows (fund balance, TLC, payout, wallet).

Verify lock-on-review for balance sends: preview on amount, lock at review, execute-only on authorize.

## Feature flags

Per provider (default **on** unless env disables):

- `PAYOUT_LOCK_ON_REVIEW=false` — all providers
- `PAYOUT_LOCK_ON_REVIEW_NOAH=false`
- `PAYOUT_LOCK_ON_REVIEW_YELLOWCARD=false`
- `PAYOUT_LOCK_ON_REVIEW_WALLET=false`

## Prerequisites

1. Apply `business/scripts/sql/payout-lock-sessions-schema.sql` to Supabase.
2. User has USD/EUR balance and a saved recipient for each corridor.

## API flow

| Step | Endpoint | Expected |
|------|----------|----------|
| Amount preview | `POST /api/payouts/quote` | `quotePhase: "preview"`, `requiresConfirm: true` |
| Review lock | `POST /api/payouts/confirm` | `quotePhase: "locked"`, `lockId` |
| Authorize | `POST /api/noah/transfers` | Body includes `lockId`; no second prepare/YC send |

Wallet:

| Step | Endpoint | Expected |
|------|----------|----------|
| Preview | `POST /api/wallets/send/quote` | Session `quoted` |
| Lock | `POST /api/wallets/send/confirm` | Session `locked`; LI.FI stores `lifi_quote_id` |
| Execute | `POST /api/wallets/send/execute` | Uses locked session; no full LI.FI re-search when fresh |

## Manual checks

### Noah USD → NGN bank (web)

1. Send → balance → enter amount → Continue shows spinner only if lock cold.
2. Review shows locked fees, countdown, ETID when allocated.
3. Authorize: network tab shows **one** transfer call with `lockId`; no duplicate `/payouts/confirm`.
4. Edit recipient after review → authorize fails or forces re-confirm.

### YC USD → local (mobile)

1. Amount Continue calls confirm (POST `/send` at lock time).
2. PIN → execute: no YC pricing calls in logs; `lockId` on transfer body.
3. Expired quote disables CTA with “go back” copy.

### Turnkey USDC → USDC wallet

1. Confirm promotes session to `locked`.
2. Execute uses session amounts only.

### LI.FI USDC → USDT Tron

1. Confirm stores LI.FI artifact on session.
2. Execute signs without binary search when `lifi_from_amount_raw` present.

### Regression

- TLC cross-border pay-in unchanged (confirm-on-review still on `/api/yc/cross-border/confirm`).
- Fund-balance pay-in unchanged.

## Automated tests

```bash
cd business && npm test -- lib/payout/confirm-payout-order.test.ts lib/yellowcard/payout-quote.test.ts
cd mobile && npm test -- src/lib/sendFlowPayoutQuote.test.ts
```
