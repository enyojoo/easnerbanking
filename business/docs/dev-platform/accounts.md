# Accounts

An account is a **virtual account issued to a customer**. It is not a balance Easner holds, and it is not the Banking USD or EUR tile.

Creating a customer issues a USD account on their wallet. Open another currency with `POST /v1/accounts`. Console **Accounts** is the directory of issued accounts. Open a customer to see theirs on their profile.

**Scope:** `GET` needs `accounts.read`. `POST` needs `accounts.write`.

## Object

| Field | Type | Notes |
|---|---|---|
| `id` | string | `acct_…` |
| `currency` | string | Uppercase, e.g. `USD`, `EUR` |
| `available` | integer | Cents on this issued account |
| `pending` | integer | Cents not yet available |
| `customer` | string \| null | `cus_…` the account was issued to |
| `livemode` | boolean | |

```json
{
  "id": "acct_…",
  "currency": "USD",
  "available": 4900,
  "pending": 0,
  "customer": "cus_…",
  "livemode": false
}
```

## List

Issued accounts only. Pass `customer` to see one person's accounts.

```bash
curl "https://api.easner.com/v1/accounts?customer=cus_…" \
  -H "Authorization: Bearer $EASNER_SECRET_KEY"
```

```json
{ "data": [{ "id": "acct_…", "currency": "USD", "available": 4900, "pending": 0, "customer": "cus_…", "livemode": false }] }
```

Empty `data` is expected before you create a customer.

## Open

`POST /v1/accounts` with `{ "currency": "EUR", "customer": "cus_…" }`.

```bash
curl https://api.easner.com/v1/accounts \
  -H "Authorization: Bearer $EASNER_SECRET_KEY" \
  -H "Content-Type: application/json" \
  -d '{"currency":"EUR","customer":"cus_…"}'
```

`201` and the account. Opening the same currency for the same customer again returns the existing account.

`400` `invalid_currency` if `currency` is missing. `400` `invalid_customer` if `customer` is missing. `404` if the customer is not on this book. Deposit restrictions return `403`.

## Retrieve

`GET /v1/accounts/:id` → Account. `404` if the id is not on this book.

## Events

| Event | When |
|---|---|
| `account.updated` | Available or pending changed |
| `payment.available` | Collected funds became usable |

## Expected

- Create the customer first. USD is issued automatically.
- Open EUR (or another currency) on that same customer when you need it.
- Read `available` on the issued account before you quote a send.
- Console Accounts lists issued accounts. The customer profile shows the same objects.

## Next

[Destinations](./destinations.md)
