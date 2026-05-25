# Noah rates pricing (global balance payout)

**Status:** Active for USD/EUR balance → local fiat sends.  
**Table:** `noah_rates` (separate from P2P `exchange_rates`).

---

## Two layers

### Planning layer (`noah_rates`)

- Supplier: Noah GET `/prices` → `Items[0].Rate` (mid-market, stable by ticket size)
- Easner margin applied → `rate` column (customer-facing)
- Powers send rate label, mid-notional “you send”, confirm exchange rate row
- Synced on a schedule; ops can override via office admin

### Execution layer (Noah prepare)

- `POST /transactions/sell/prepare` → `cryptoAuthorizedAmount` is the authoritative max debit
- Never replaced by table math
- “Total debited” and balance checks use prepare

---

## Three rate numbers (do not conflate)

| Name | Example (₦5,000 NG) | Meaning |
|------|---------------------|---------|
| Noah mid (`noah_mid`) | ~1,356 NGN/USD | Raw `Rate` from `/prices`; matches `FiatPayment.Rate` at settlement |
| Customer rate (`noah_rates.rate`) | ~1,336 NGN/USD | Mid × `(1 − NOAH_PAYOUT_MARGIN)` |
| All-in effective | ~1,106 NGN/USD | `receive ÷ totalDebited` — includes channel spread; not shown as exchange rate |

Do **not** use `DestinationAmount ÷ SourceAmount` from `/prices` as the mid — that embeds channel fees and varies by ticket size.

---

## Margin formula (v1)

```text
customer_rate = noah_mid × (1 − NOAH_PAYOUT_MARGIN)
```

Default margin: 1.5% (`NOAH_PAYOUT_MARGIN` in `packages/rate-sync/src/noah-margin.ts`). P2P manual send still uses `EASNER_BRIDGE_MARGIN` (5%) on `exchange_rates`.

### Refresh cadence

| Mechanism | Default | Config |
|-----------|---------|--------|
| Stale TTL (send blocked if older) | **15 min** | `NOAH_RATES_REFRESH_TTL_MS` (business env) |
| Background sync on read | When stale | `GET /api/fx/noah-rates` triggers `syncNoahRatesSafe` |
| Vercel cron | **Not scheduled** | Add `/api/cron/sync-noah-rates` to `business/vercel.json` |
| Office / CLI | Manual | Platform Control → Sync rates, or `scripts/sync-noah-rates.ts` |

Easner revenue on global payout comes from this spread only — not from Noah settlement Breakdown buckets.

---

## Customer UI rows

| Row | Source |
|-----|--------|
| Exchange rate | `noah_rates.rate` |
| You send | `receive ÷ rate` |
| Exchange fee | `totalDebited − youSend − processingFee` (aggregate; mostly channel cost) |
| Processing fee | `noah_rates.fee_*` when configured |
| Total debited | prepare / `cryptoAuthorizedAmount` |
| Recipient gets | user input |

---

## Internal: Noah settlement Breakdown (not customer UI)

For engineering/ops understanding only. These fields appear on settled Noah OffNetwork OUT transactions; we do **not** show them in send/confirm/transaction detail v1.

| Bucket | Role |
|--------|------|
| **ChannelFee** | Rail/channel cost in USDC |
| **Remaining** | USDC sold at Noah mid to deliver recipient fiat |
| **BusinessFee** | Small surplus after channel + payout allocation; credits merchant USDC balance — not Easner-configured margin |

Example: total 4.52 USDC → ChannelFee 0.79 + Remaining 3.69 (→ ₦5,000 at mid) + BusinessFee 0.05.

---

## Non-goals (v1)

- Merge into `exchange_rates`
- Price via Noah BusinessFee
- Replace prepare with table-derived debits
- Show Breakdown buckets in customer UI
- Model ChannelFee in `noah_rates`
