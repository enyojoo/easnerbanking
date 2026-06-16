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

### Execution layer (Noah prepare + margin capture)

- `POST /transactions/sell/prepare` → `cryptoAuthorizedAmount` is the Noah floor (`noahFloor`)
- Wallet debit = `noahFloor + marginAmount` where `marginAmount = customerPrincipal − midNotional`
- `customerPrincipal` = `receive ÷ noah_rates.rate` (you-send box)
- Plan A (default): single Turnkey send of `totalDebited`; surplus lands as Noah `BusinessFee` at settlement
- Plan B (`GLOBAL_PAYOUT_MARGIN_CAPTURE_MODE=split_debit`): Turnkey sends `noahFloor` to Noah + `marginAmount` to platform liquidity pool

---

## Three rate numbers (do not conflate)

| Name | Example (₦5,000 NG) | Meaning |
|------|---------------------|---------|
| Noah mid (`noah_mid`) | ~1,356 NGN/USD | Raw `Rate` from `/prices`; matches `FiatPayment.Rate` at settlement |
| Customer rate (`noah_rates.rate`) | ~1,349 NGN/USD | Mid × `(1 − NOAH_PAYOUT_MARGIN)` |
| All-in effective | ~1,106 NGN/USD | `receive ÷ totalDebited` — includes channel spread; not shown as exchange rate |

Do **not** use `DestinationAmount ÷ SourceAmount` from `/prices` as the mid — that embeds channel fees and varies by ticket size.

---

## Margin formula (v1)

```text
customer_rate = noah_mid × (1 − NOAH_PAYOUT_MARGIN)
```

Default margin: **0.5%** (`NOAH_PAYOUT_MARGIN` in `packages/rate-sync/src/noah-margin.ts`). Override at deploy time with env:

```text
NOAH_PAYOUT_MARGIN=0.005
```

Decimal fraction (same convention as `WALLET_SEND_MARGIN`). Invalid or missing values fall back to the code default. P2P manual send still uses `EASNER_BRIDGE_MARGIN` (5%) on `exchange_rates`.

### Refresh cadence

| Mechanism | Default | Config |
|-----------|---------|--------|
| Background refresh TTL | **5 min** | `NOAH_RATES_REFRESH_TTL_MS` (business env) — triggers background sync only; send uses active DB rows regardless of age |
| Background sync on read | When older than TTL | `GET /api/fx/noah-rates` triggers `syncNoahRatesSafe` |
| Vercel cron | **Every 5 min** | `/api/cron/sync-noah-rates` in `business/vercel.json` |
| Office / CLI | Manual | Platform Control → Sync rates, or `scripts/sync-noah-rates.ts` |

Easner revenue on global payout is captured at wallet debit via the margin wedge (`marginAmount`), reconciled against Noah `BusinessFee` on settlement (Plan A).

---

## Customer UI rows

| Row | Source | Shown? |
|-----|--------|--------|
| Exchange rate | `noah_rates.rate` | Yes |
| You send | Quote `customerPrincipal` (= `receive ÷ rate`) | Yes |
| Exchange fee | Quote `channelCost` = Noah `ChannelFee` (prepare `Breakdown` when present, else `noahFloor − midNotional − marginAmount`) | Yes (cross-currency) |
| Processing fee / margin | Quote `marginAmount` | **Hidden** (in customer rate / You send) |
| Total debited | Quote `totalDebited` (= `noahFloor + marginAmount`; authoritative wallet debit) | Yes |
| Recipient gets | user input (full prepare receive) | Yes |

Product rule (shared with [wallet-send-pricing.md](./wallet-send-pricing.md)): margin baked into quoted rate → hide processing row; explicit 1:1 fee on top → show it.

### Confirm row identity (global fiat)

```text
totalDebited = customerPrincipal + channelCost + marginAmount
channelCost  = Noah ChannelFee ≈ merchant PDF rail fee
```

`You send + Exchange fee` may be **marginAmount short** of `Total debited` because margin is hidden in the quoted rate and also captured in Plan A wallet debit. **Total debited** is the source of truth.

Settlement: `noahFloor = ChannelFee + Remaining + BusinessFee`; quoted `channelCost` reconciles to settlement `ChannelFee`, not `BusinessFee`.

---

## Noah Local Currency Offramp fee schedule (merchant reference)

Used for validation/reconciliation in [`noah-offramp-fee-schedule.ts`](../business/lib/noah/noah-offramp-fee-schedule.ts) — **does not override** prepare `noahFloor`.

| Currency | Fixed USD | Variable |
|----------|-----------|----------|
| NGN | $0.50 | 0.50% |
| ZAR | $1.00 | 0.55% |
| KES | $1.25 | 0.55% |
| GHS | $1.50 | 0.55% |
| RWF | From API probe | From API probe |

Outbound Fedwire/ACH/SEPA/SWIFT fixed fees apply to USD/EUR/GBP rails only — not NGN/KES/GHS/ZAR/RWF local offramp.

Probe + MCP validation: [noah-offramp-pricing-probe.md](./noah-offramp-pricing-probe.md).

### Ticket-sized mid at quote

`noah_rates.noah_mid` is synced at a **$100** reference. At quote time, `payout-quote.ts` fetches `/prices` with `SourceAmount = noahFloor` (prepare `cryptoAuthorizedAmount`) and uses that implied mid for `channelCost` when prepare `Breakdown` is absent. This avoids scaling a ₦5k benchmark to ₦100k.

---

## Internal: Noah settlement Breakdown (not customer UI)

For engineering/ops understanding only. These fields appear on settled Noah OffNetwork OUT transactions; we do **not** show them in send/confirm/transaction detail v1.

| Bucket | Role |
|--------|------|
| **ChannelFee** | Rail/channel cost in USDC |
| **Remaining** | USDC sold at Noah mid to deliver recipient fiat |
| **BusinessFee** | Plan A: surplus margin after channel + payout allocation (~`marginAmount`); Plan B: near zero (margin sent to platform pool on-chain) |

Example: total 4.52 USDC → ChannelFee 0.79 + Remaining 3.69 (→ ₦5,000 at mid) + BusinessFee 0.05.

---

## Non-goals (v1)

- Merge into `exchange_rates`
- Price via Noah BusinessFee
- Replace prepare with table-derived debits
- Show Breakdown buckets in customer UI
- Model ChannelFee in `noah_rates`
