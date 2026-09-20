# Webhooks

Easner POSTs signed events to one URL per mode. Tick which events you want in Console → Webhooks. Unticked events are not sent.

Headers on every delivery:

| Header | Value |
|---|---|
| `content-type` | `application/json` |
| `easner-event` | The event name, e.g. `transfer.completed` |
| `easner-signature` | `t=<unix>,v1=<hex>` |

Body:

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

Return `2xx` quickly. Do the work after you ACK, or keep the handler short. Anything else is a failure and will retry.

## Verify `easner-signature`

HMAC-SHA256 of `${t}.${rawBody}` with your webhook secret. Compare with `v1` using a constant-time compare. Reject if the timestamp is older than 5 minutes.

```js
import { createHmac, timingSafeEqual } from "node:crypto";

export function verifyWebhook(rawBody, signatureHeader, secret) {
  const parts = Object.fromEntries(
    String(signatureHeader || "")
      .split(",")
      .map((part) => part.trim().split("=", 2)),
  );
  const timestamp = Number(parts.t);
  const expected = createHmac("sha256", secret)
    .update(`${timestamp}.${rawBody}`)
    .digest("hex");
  const got = String(parts.v1 || "");
  if (got.length !== expected.length) return false;
  if (Math.abs(Date.now() / 1000 - timestamp) > 300) return false;
  return timingSafeEqual(Buffer.from(expected), Buffer.from(got));
}
```

Use the **raw** body. Re-serializing JSON will fail the signature.

## Catalog

Tick these in Console. Default ticks are the checkout collect events.

### Collect

**`checkout.completed`** — Payment succeeded. Fulfil the order.

```json
{
  "type": "checkout.completed",
  "created": 1758336000,
  "data": {
    "checkout_session_id": "cs_…",
    "mode": "payment",
    "amount_cents": 4900,
    "currency": "USD",
    "customer_email": "ada@example.com",
    "subscription_id": null,
    "metadata": { "order_id": "ord_123" },
    "paid_at": "2026-09-20T00:00:00.000Z",
    "livemode": false
  }
}
```

**`checkout.async_succeeded`** — A delayed method (bank debit) cleared.

**`checkout.failed`** — Abandoned or failed. Do not fulfil.

**`payment.available`** — Funds are usable on a platform account.

```json
{
  "type": "payment.available",
  "created": 1758336000,
  "data": { "amount_cents": 4750, "currency": "USD", "available_at": "2026-09-20T00:00:00.000Z" }
}
```

**`subscription.updated`** / **`subscription.canceled`**

```json
{
  "type": "subscription.updated",
  "created": 1758336000,
  "data": { "subscription_id": "sub_…", "status": "active", "metadata": { "user_id": "123", "plan": "pro" } }
}
```

### Platform book

**`account.updated`** — Available or pending changed. `data` is the [Account](./accounts.md).

**`customer.created`** / **`customer.updated`** — `data` is the [Customer](./customers.md).

**`transfer.created`** / **`transfer.completed`** / **`transfer.failed`** — `data` is the [Transfer](./transfers.md). Failed includes `error`.

**`transaction.created`** — `data` is the [Transaction](./transactions.md).

## Retries

Failed deliveries retry at 1 minute, 5 minutes, 30 minutes, 2 hours, then 24 hours. After five attempts the delivery is `failed`. Redeliver from Console → Webhooks.

Deliveries are listed in Console. Use Send test to confirm the URL is reachable; that is not a real payment.

## Expected handler

1. Read the raw body.
2. Verify `easner-signature`.
3. Switch on `type`.
4. Idempotent fulfil (`checkout_session_id`, `id` on the transfer, or your `metadata`).
5. Return `200`.

## Next

[Test and live](./test-and-live.md)
