# Dev is Console + platform v1

Banking is the operator product on `business.easner.com`. Dev is the same origin in Dev mode: **Console** (`/console`) plus **platform `v1`** on `https://api.easner.com`. There is no second host.

Two books. API money is the platform book. It does not show in Banking Transactions. Banking Send does not show in Dev Transactions.

Wallets are the same non-custodial shape as Business and Mobile: an isolated wallet per platform treasury and per API customer. Integrators never receive wallet keys. They call `v1`.

Out of scope: cards, payroll, Banking Send, and invoice APIs.

Amounts are minor units (cents). Errors are `{ error: { type, code, message } }`. Writes take `Idempotency-Key`.

## Console

Console is Dev Home.

- `/console` — live/test, total volume, last webhook, last API errors
- `/console/keys` — one test key and one live key
- `/console/webhooks` — one endpoint, event ticks, deliveries, redeliver
- `/console/logs` — recent `v1` requests
- `/console/events` — event catalog

Nav: Console, Customers, Accounts, Transactions, Checkout. Settings stays in both modes.

New keys include checkout, accounts, and transfers scopes. Existing checkout-only keys stay checkout-only until you mint a new key.

One webhook URL per mode. Tick events. Verify `easner-signature`. Failed deliveries retry.

## Authentication and errors

```bash
curl https://api.easner.com/v1/accounts \
  -H "Authorization: Bearer easner_sk_test_…"
```

Livemode comes from the key prefix (`easner_sk_test_` or `easner_sk_live_`). A key without the required scope returns `403` `{ error: { type: "permission", code: "key_forbidden", message: "…" } }`.

## Objects

Ids: `cus_`, `acct_`, `dest_`, `qt_`, `tr_`, `txn_`, `cs_`.

### Customers

Creating a customer creates their wallet (same shape as an Easner user).

```bash
curl https://api.easner.com/v1/customers \
  -H "Authorization: Bearer easner_sk_test_…" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: $(uuidgen)" \
  -d '{"email":"ada@example.com","name":"Ada"}'
```

```json
{
  "id": "cus_…",
  "email": "ada@example.com",
  "name": "Ada",
  "external_id": null,
  "status": "active",
  "livemode": false,
  "created": "2026-09-20T00:00:00.000Z"
}
```

`GET /v1/customers`, `GET /v1/customers/:id`.

### Accounts

```json
{ "id": "acct_…", "currency": "USD", "available": 4900, "pending": 0, "livemode": false }
```

`GET /v1/accounts`, `POST /v1/accounts` with `{ "currency": "USD" }`, `GET /v1/accounts/:id`.

### Destinations

Types: `bank`, `mobile_money`, `wallet`, `easetag`.

```bash
curl https://api.easner.com/v1/destinations \
  -H "Authorization: Bearer easner_sk_test_…" \
  -H "Content-Type: application/json" \
  -d '{"type":"easetag","details":{"easetag":"ada"}}'
```

### Quotes then Transfers

```bash
curl https://api.easner.com/v1/quotes \
  -H "Authorization: Bearer easner_sk_test_…" \
  -H "Content-Type: application/json" \
  -d '{"amount":4900,"currency":"usd","destination":"dest_…"}'

curl https://api.easner.com/v1/transfers \
  -H "Authorization: Bearer easner_sk_test_…" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: $(uuidgen)" \
  -d '{"quote":"qt_…"}'
```

Public bodies have no `recipientId` or `formSessionId`.

### Transactions

`GET /v1/transactions`, `GET /v1/transactions/:id` — platform book only.

### Checkout

Existing `POST /v1/checkout/sessions` and `js.easner.com/v1/checkout.js`. When the session is created with a merchant secret key, settlement credits the platform book.

## Webhooks

Header: `easner-signature: t=<unix>,v1=<hmac_sha256 of t.body>`. Also `easner-event`.

Events: `checkout.completed`, `checkout.failed`, `checkout.async_succeeded`, `payment.available`, `account.updated`, `customer.created`, `customer.updated`, `transfer.created`, `transfer.completed`, `transfer.failed`, `transaction.created`.

```json
{
  "type": "transfer.completed",
  "created": 1758336000,
  "data": {
    "id": "tr_…",
    "amount": 4900,
    "currency": "USD",
    "status": "completed",
    "livemode": false
  }
}
```

## Test vs live

Test keys complete without moving live rails money. Live keys debit and credit the platform book.

## Not in this file

Host split, Office Enable Dev Platform, Front Door, and env tables live in `platform-api-split.md`.
