# Transactions

A transaction is a row on the **platform** ledger. This is the only book `v1` exposes.

Banking Send, invoices, links, and terminal do not appear here. Dev `/transactions` in Console reads this list. Banking `/transactions` does not.

**Scope:** `accounts.read`

## Object

| Field | Type | Notes |
|---|---|---|
| `id` | string | `txn_…` |
| `type` | string | `transfer`, `checkout`, and other platform types |
| `amount` | integer | Cents, always positive |
| `currency` | string | |
| `direction` | string | `in` or `out` |
| `status` | string | `completed`, `pending`, `failed` |
| `account` | string \| null | `acct_…` |
| `customer` | string \| null | `cus_…` |
| `transfer` | string \| null | `tr_…` |
| `checkout_session` | string \| null | `cs_…` |
| `description` | string \| null | |
| `livemode` | boolean | |
| `created` | ISO-8601 | |

```json
{
  "id": "txn_…",
  "type": "transfer",
  "amount": 4900,
  "currency": "USD",
  "direction": "out",
  "status": "completed",
  "account": "acct_…",
  "customer": null,
  "transfer": "tr_…",
  "checkout_session": null,
  "description": "Transfer",
  "livemode": false,
  "created": "2026-09-20T00:00:00.000Z"
}
```

## List

```bash
curl https://api.easner.com/v1/transactions \
  -H "Authorization: Bearer $EASNER_SECRET_KEY"
```

```json
{ "data": [ /* Transaction */ ] }
```

Newest first. Up to 100. Filtered by the key’s livemode.

## Retrieve

`GET /v1/transactions/:id` → Transaction. `404` if missing or the other mode.

## Events

| Event | When |
|---|---|
| `transaction.created` | A row was written |
| `payment.available` | A collect became usable `in` |
| `account.updated` | The account totals changed |

## Expected

- Reconcile your product against this list, not Banking Transactions.
- `direction: "in"` is Checkout (or other credits) on the platform book.
- `direction: "out"` is a transfer.

## Next

[Checkout](./checkout.md)
