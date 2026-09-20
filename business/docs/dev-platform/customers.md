# Customers

A customer is your end user on the platform. Creating a customer creates their wallet — the same isolated wallet shape as an Easner user — and issues a USD virtual account. They never log into Easner. You hold the id and call `v1`.

Invoice customers in Banking are a different object. They do not appear here.

**Scope:** `GET` needs `accounts.read`. `POST` needs `transfers.write`.

## Object

| Field | Type | Notes |
|---|---|---|
| `id` | string | `cus_…` |
| `email` | string \| null | Optional |
| `name` | string \| null | Optional |
| `external_id` | string \| null | Your id. Use this to map your user |
| `status` | string | `active` |
| `livemode` | boolean | From the key |
| `created` | ISO-8601 | |
| `accounts` | Account[] | Present on create and retrieve. Issued virtual accounts |

## Create

```bash
curl https://api.easner.com/v1/customers \
  -H "Authorization: Bearer $EASNER_SECRET_KEY" \
  -H "Content-Type: application/json" \
  -d '{"email":"ada@example.com","name":"Ada","external_id":"user_42"}'
```

```json
{
  "id": "cus_…",
  "email": "ada@example.com",
  "name": "Ada",
  "external_id": "user_42",
  "status": "active",
  "livemode": false,
  "created": "2026-09-20T00:00:00.000Z",
  "accounts": [
    {
      "id": "acct_…",
      "currency": "USD",
      "available": 0,
      "pending": 0,
      "customer": "cus_…",
      "livemode": false
    }
  ]
}
```

`201` on success. `400` `create_failed` if the wallet or USD account could not be created.

## List

`GET /v1/customers` → `{ "data": [ Customer, … ] }`

Newest first. Up to 100. List rows do not include `accounts`.

## Retrieve

`GET /v1/customers/:id` → `Customer` including `accounts`.

`404` `not_found` if the id is missing or belongs to the other livemode.

In Console, open the customer to see the same issued accounts on their profile.

## Events

| Event | When |
|---|---|
| `customer.created` | After a successful create |
| `customer.updated` | When the record changes |
| `account.updated` | When the issued USD account is created |

## Expected

- Store `id` and `external_id` on your side.
- Use the issued `acct_…` as the source on quotes and transfers.
- Attach destinations with `"customer": "cus_…"`.
- Do not expect a wallet address or signing key in the response.

## Next

[Accounts](./accounts.md)
