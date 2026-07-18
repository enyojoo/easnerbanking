# Cross-Border TLC Test Runbook

End-to-end and staging checks for Yellowcard **Through Local Currency** (cross-border send): leg 1 local pay-in → YC USDC → omnibus → leg 2 YC send to recipient.

## Prerequisites

- Business API env: `DEPOSIT_OMNIBUS_SOLANA_ADDRESS_USD` (Solana USDC omnibus for YC settlement).
- Office: pay-in corridor enabled (`yc_receive_enabled`) for sender country/currency/rail.
- Sandbox YC credentials for leg 1; staging for leg 2 omnibus + send completion.

## Leg 1 — Sandbox E2E (quote → complete UI → YC receive)

### Bank TLC

1. Send → recipient in foreign currency → **Through local currency** → bank rail.
2. Amount screen: while typing receive amount, debounced preview shows fee-inclusive **Total to pay** (not rate-only `receive / rate`). Entering receive currency below the KES min auto-bumps to the rate-adjusted floor (no min hint copy).
3. **Continue** may show brief spinner when quote is not warm; navigates to review with stashed quote.
4. Review (locked): **Transaction ID** (ETID), exchange rate, **Transfer amount**, processing fee, **Total to pay**, **Recipient gets**, **Transfer method: Local Transfer**, quote countdown.
5. Complete: minimal summary (ETID + **Recipient gets** + **Local Transfer**), **Send exactly {localPayIn}**, bank VA fields, **I've made the payment**.
6. Transaction detail: hero **Send to {recipient}**, ledger **Amount paid**, status **Processing**, lifecycle single **Processing** step.
7. After confirm, verify `yc_transfers.metadata`: `omnibus_in_expected >= sendCrypto + processing_fee + margin`, `leg2_crypto_expected`, `margin_capture_mode: fee_wallet_omnibus`.
8. After leg 1 settles: `omnibus_in_actual >= omnibus_in_expected` (within tolerance) before leg 2 triggers; if under-funded, `ops_alert: yc_omnibus_underfunded` and leg 2 does not start.
9. After leg 2 SEND.COMPLETE: `fee_wallet_sweep <= omnibus_in_actual - leg2_crypto` (sweep capped to residual).

### MoMo TLC

1. Same through MoMo rail; amount **Continue** prefetches networks only (no quote).
2. Review (preview): rate, **Estimated to pay**, **Recipient gets**, recipient, **Local Transfer**, MoMo phone/network inputs inside review card (web footer).
3. **Continue** on review creates quote (single POST, stash deduped) then navigates to complete.
4. Complete: full breakdown (ETID, rate, deposit amount, fee, **Total to pay**, **Recipient gets**, **Local Transfer**); authorize notice; network + phone; **Authorize payment** (no Send exactly).
5. Verify `POST /api/yellowcard/cross-border/quote` returns `easnerTransactionId` (not client-generated ETID).

### API parity checks

- Below-min receive amount → `400` + `code: yc_amount_below_min`.
- Disabled corridor → `yc_corridor_disabled`.
- Missing MoMo phone/network → `momo_source_required`.
- Missing omnibus → `503` + `yc_settlement_wallet_not_configured`.

## Leg 2 — Staging (omnibus inbound → leg 2 → SEND.COMPLETE)

1. Complete leg 1 pay-in in sandbox until YC receive settles to omnibus (or simulate omnibus Turnkey webhook with matching `txHash`/amount).
2. Confirm `handleDepositOmnibusInbound` sets `leg1_settled_at`, triggers `maybeExecuteCrossBorderLeg2`.
3. Confirm `executeYcCryptoDeposit` + YC send webhook → `completeCrossBorderOnSendSuccess`.
4. Transaction detail: status **Completed**, lifecycle **Processing** (complete) → **Completed**.

## Failure cases

| Case | Expected |
|------|----------|
| Leg 1 expire / receive failed | `failure_leg: leg1`, failed lifecycle copy, no balance credit |
| Leg 2 SEND.FAILED | `failure_leg: leg2`, ops alert `cross_border_leg2_failed_refund_to_fee_wallet` |
| Abandoned `awaiting_pay_in` | Quote expires; no leg 2 until leg 1 settles |

## Probe script (optional)

Extend corridor/fee probe:

```bash
cd business && npx tsx scripts/probe-yc-cross-border-fees.ts
```

Use output to verify cross-rate, pay-in limits, and corridor gates before enabling a new TLC corridor.

## Metadata invariants (quote time)

- `easner_transaction_id`, `recipient_snapshot`, `payout_review.transfer_method = "Local Transfer"`.
- `payout_type: global_fiat`, `yc_mode: cross_border_send`, `processing_at` at quote.
- Fund-balance deposits unchanged (`Bank Transfer` / `Mobile Money`).

## Fund balance pay-in economics (sandbox)

| Case | Expected |
|------|----------|
| Bank $2,000 credit confirm | `metadata.omnibus_in_expected >= 2020` (credit + 1% fee); `quoted_pay_in` matches YC-locked local amount |
| MoMo $1,000 credit confirm | `omnibus_in_expected >= 1010` |
| Amount step (USD mode) | Shows fee-inclusive **Total to pay** (~265k KES for $2k), not rate-only ~257k |
| Settlement sufficient | User credited full `quoted_receive`; fee wallet sweep = min(quoted fee+margin, omnibus − credit) |
| Settlement under-funded | No wallet credit; `ops_alert: yc_omnibus_underfunded`; transfer stays processing |
| Confirm rejects bad YC quote | `400` + `code: yc_omnibus_below_required` when YC `cryptoAmount` cannot fund credit + fee |

## YC balance payout economics (USD wallet → local)

| Case | Expected |
|------|----------|
| Quote preview | `totalDebited` uses padded YC floor (`computeYcBalancePayoutPricingBeforeSend`) — conservative vs zero-fee estimate |
| Execute lock (POST /send) | `assertYcBalancePayoutEconomicsSufficient`: `totalDebited − cryptoAmount >= margin + processingFee` |
| Ledger metadata | `total_debited`, `crypto_authorized_amount`, `margin_amount`, `processing_fee`, `margin_capture_mode: fee_wallet_omnibus` from **locked** POST /send pricing |
| SEND.COMPLETE sweep | `fee_wallet_sweep <= totalDebited − cryptoAuthorized` (capped to debit surplus) |
| Bad lock economics | Execute fails with `yc_payout_economics_invalid` before wallet debit |
