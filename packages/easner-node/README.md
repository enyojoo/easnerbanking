# @easner/node

Server-side SDK for the Easner Checkout API. Zero dependencies (Node 18+).

## Create a checkout session

```ts
import { EasnerClient } from "@easner/node"

const easner = new EasnerClient(process.env.EASNER_SECRET_KEY!) // easner_sk_test_… or easner_sk_live_…

const session = await easner.checkout.sessions.create(
  {
    currency: "USD",
    line_items: [{ name: "Pro plan", amount: 4900 }],
    customer_email: "buyer@example.com",
    success_url: "https://shop.example.com/thanks?session_id={CHECKOUT_SESSION_ID}",
  },
  { idempotencyKey: "order-42" }, // retries return the same session
)

// Hand session.client_secret to EasnerCheckout.mount(...) in the browser.
```

Look up a session from your thank-you page:

```ts
const status = await easner.checkout.sessions.retrieve(sessionId)
if (status.status === "complete") {
  // fulfil
}
```

API errors throw `EasnerApiError` with `status`, `code`, and `type`.

## Verify webhooks

```ts
import { constructWebhookEvent } from "@easner/node"

app.post("/webhooks/easner", express.raw({ type: "application/json" }), (req, res) => {
  let event
  try {
    event = constructWebhookEvent(
      req.body.toString("utf8"),
      req.headers["easner-signature"] as string,
      process.env.EASNER_WEBHOOK_SECRET!, // easner_whsec_…
    )
  } catch {
    return res.status(400).send("invalid signature")
  }

  switch (event.type) {
    case "checkout.completed":
      // safe to fulfil the order
      break
    case "payment.available":
      // funds are usable in your Easner Balance
      break
  }
  res.status(200).end()
})
```

Verification uses HMAC-SHA256 over `"<timestamp>.<raw body>"` with a timing-safe
compare and a 5-minute default tolerance.
