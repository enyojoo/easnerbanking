# Errors

Every error body is:

```json
{
  "error": {
    "type": "invalid_request",
    "code": "invalid_amount",
    "message": "amount must be a positive integer in cents"
  }
}
```

Do not parse the message. Branch on `type` and `code`.

## Types

| `type` | HTTP | Meaning |
|---|---|---|
| `authentication` | 401 | Missing or invalid key |
| `permission` | 403 | Key lacks the scope, or the account is restricted |
| `invalid_request` | 400 / 404 / 422 | Bad body, unknown id, expired quote |
| `api_error` | 5xx | Unexpected failure. Retry with the same `Idempotency-Key` |

## Common codes

| `code` | When |
|---|---|
| `invalid_api_key` | Header missing or not an `easner_sk_*` key |
| `key_forbidden` | Scope missing |
| `not_found` | Id does not exist in this livemode |
| `invalid_amount` | Amount missing, zero, or not a positive integer |
| `invalid_currency` | `POST /v1/accounts` without a currency |
| `invalid_customer` | `POST /v1/accounts` without a customer |
| `invalid_source` | `POST /v1/quotes` without a source account |
| `invalid_type` | Destination type is not `bank`, `mobile_money`, `wallet`, or `easetag` |
| `create_failed` | Create customer, account, destination, or quote failed |
| `transfer_failed` | Transfer could not debit the platform book |
| `origin_not_allowed` | Checkout success/cancel URL is not on an allowed website |
| `missing_id` | `GET /v1/checkout/sessions` without `id` |
| `session_create_failed` | Checkout session could not be created |
| `invalid_interval` | Subscription interval is not `month` or `year` |

## Expected client behavior

- `401` / `403` — stop. Fix the key.
- `404` — the object is not in this mode. Check test vs live.
- `400` `transfer_failed` with "Quote expired" — create a new quote.
- `400` `transfer_failed` with insufficient funds — fund the issued account (Checkout or a test credit path), then retry with a **new** idempotency key only if you intend a new send.
- `5xx` — retry the same `Idempotency-Key`.

## Next

[Customers](./customers.md)
