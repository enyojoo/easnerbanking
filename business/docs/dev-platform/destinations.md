# Destinations

A destination is where a transfer can land. It is not an account. Accounts hold funds. Destinations receive them.

**Scope:** `GET` needs `accounts.read`. `POST` needs `transfers.write`.

## Types

| `type` | Use |
|---|---|
| `easetag` | An Easner tag |
| `wallet` | On-chain address |
| `bank` | Bank account |
| `mobile_money` | Mobile-money wallet |

## Object

| Field | Type | Notes |
|---|---|---|
| `id` | string | `dest_…` |
| `type` | string | One of the types above |
| `customer` | string \| null | `cus_…` if attached |
| `details` | object | Type-specific. Never log full account numbers in your app logs if you can avoid it |
| `livemode` | boolean | |
| `created` | ISO-8601 | |

## Create

```bash
curl https://api.easner.com/v1/destinations \
  -H "Authorization: Bearer $EASNER_SECRET_KEY" \
  -H "Content-Type: application/json" \
  -d '{"type":"easetag","customer":"cus_…","details":{"easetag":"ada"}}'
```

```json
{
  "id": "dest_…",
  "type": "easetag",
  "customer": "cus_…",
  "details": { "easetag": "ada" },
  "livemode": false,
  "created": "2026-09-20T00:00:00.000Z"
}
```

`201`. `400` `invalid_type` if `type` is unknown.

## Details by type

Pass what you have. These are the expected keys:

**Easetag**

```json
{ "type": "easetag", "details": { "easetag": "ada" } }
```

**Wallet**

```json
{
  "type": "wallet",
  "details": {
    "address": "…",
    "network": "solana",
    "currency": "USDC"
  }
}
```

Live wallet destinations can be priced on the quote (send may include fees). Test stays 1:1.

**Bank**

```json
{
  "type": "bank",
  "details": {
    "account_number": "…",
    "routing_number": "…",
    "bank_name": "…",
    "country": "US"
  }
}
```

**Mobile money**

```json
{
  "type": "mobile_money",
  "details": {
    "phone": "+2547…",
    "network": "mpesa",
    "country": "KE"
  }
}
```

## List

`GET /v1/destinations` → `{ "data": [ Destination, … ] }`

Newest first. Up to 100.

## Expected

- Create one destination per payout rail you support.
- Pass `destination` on the quote. Do not send internal ids (`recipientId`, form sessions). Those are not public.

## Next

[Quotes](./quotes.md)
