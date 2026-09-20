export type CheckoutRecipeId = "one_time" | "subscription" | "custom"

export type CheckoutRecipe = {
  id: CheckoutRecipeId
  title: string
  mode: "payment" | "subscription"
  blurb: string
  metadataExample: Record<string, string>
  sessionBody: Record<string, unknown>
}

export const CHECKOUT_RECIPES: CheckoutRecipe[] = [
  {
    id: "one_time",
    title: "One-time",
    mode: "payment",
    blurb: "E-commerce and invoices: charge once, fulfil in checkout.completed.",
    metadataExample: { order_id: "ord_123" },
    sessionBody: {
      mode: "payment",
      amount: 4900,
      currency: "usd",
      success_url: "https://yoursite.com/thanks",
      metadata: { order_id: "ord_123" },
    },
  },
  {
    id: "subscription",
    title: "Subscription",
    mode: "subscription",
    blurb: "SaaS: create a recurring session, unlock in checkout.completed, listen for renewals.",
    metadataExample: { user_id: "123", plan: "pro" },
    sessionBody: {
      mode: "subscription",
      amount: 4900,
      currency: "usd",
      interval: "month",
      success_url: "https://yoursite.com/thanks",
      metadata: { user_id: "123", plan: "pro" },
    },
  },
  {
    id: "custom",
    title: "Custom",
    mode: "payment",
    blurb: "Pay-for-access: bookings, downloads, or anything keyed by your own id.",
    metadataExample: { booking_id: "bk_456" },
    sessionBody: {
      mode: "payment",
      amount: 12000,
      currency: "usd",
      success_url: "https://yoursite.com/thanks",
      metadata: { booking_id: "bk_456" },
    },
  },
]

export function recipeServerNode(recipe: CheckoutRecipe, secretPlaceholder = "process.env.EASNER_SECRET_KEY"): string {
  return `const res = await fetch("https://api.easner.com/v1/checkout/sessions", {
  method: "POST",
  headers: {
    Authorization: \`Bearer \${${secretPlaceholder}}\`,
    "Content-Type": "application/json",
    "Idempotency-Key": crypto.randomUUID(),
  },
  body: JSON.stringify(${JSON.stringify(recipe.sessionBody, null, 2)}),
});
const session = await res.json();
// session.client_secret goes to the browser. Never send the secret key.`
}

export function recipeServerCurl(recipe: CheckoutRecipe): string {
  return `curl https://api.easner.com/v1/checkout/sessions \\
  -H "Authorization: Bearer $EASNER_SECRET_KEY" \\
  -H "Content-Type: application/json" \\
  -H "Idempotency-Key: $(uuidgen)" \\
  -d '${JSON.stringify(recipe.sessionBody)}'`
}

export function recipeBrowserHtml(publishableKey: string): string {
  return `<script src="https://js.easner.com/v1/checkout.js"></script>
<div id="easner-checkout"></div>
<script>
  // Same on-page form as invoices and payment links.
  fetch("/create-checkout-session", { method: "POST" })
    .then(function (r) { return r.json(); })
    .then(function (session) {
      EasnerCheckout.mount("#easner-checkout", {
        publishableKey: ${JSON.stringify(publishableKey)},
        clientSecret: session.client_secret,
        onSuccess: function () { window.location = "/thanks"; }})
      });
    });
</script>`
}

export function recipeVerifyWebhook(): string {
  return `import { createHmac, timingSafeEqual } from "node:crypto";

export function verifyWebhook(rawBody, signatureHeader, secret) {
  const parts = Object.fromEntries(
    String(signatureHeader || "")
      .split(",")
      .map((part) => part.trim().split("=", 2)),
  );
  const timestamp = Number(parts.t);
  const expected = createHmac("sha256", secret)
    .update(\`\${timestamp}.\${rawBody}\`)
    .digest("hex");
  const got = String(parts.v1 || "");
  if (got.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(expected), Buffer.from(got));
}`
}

export function recipeWebhookHandler(): string {
  return `${recipeVerifyWebhook()}

export async function POST(request) {
  const rawBody = await request.text();
  if (!verifyWebhook(rawBody, request.headers.get("easner-signature"), process.env.EASNER_WEBHOOK_SECRET)) {
    return new Response("invalid signature", { status: 400 });
  }
  const event = JSON.parse(rawBody);
  if (event.type === "checkout.completed") {
    const { metadata, subscription_id, customer_email } = event.data;
    // Fulfil the order / unlock access using metadata you sent on the session.
    console.log(metadata, subscription_id, customer_email);
  }
  return new Response("ok");
}`
}

export function recipeAiPrompt(recipe: CheckoutRecipe): string {
  return `Integrate Easner Checkout for ${recipe.title.toLowerCase()} payments.

Golden rule: the amount and secret key never go in the browser.

1. On the server, POST https://api.easner.com/v1/checkout/sessions with Bearer easner_sk_… and this JSON:
${JSON.stringify(recipe.sessionBody, null, 2)}

2. In the browser, load https://js.easner.com/v1/checkout.js and mount the form on the page (same as invoices and payment links):
EasnerCheckout.mount("#easner-checkout", { publishableKey: "easner_pk_…", clientSecret: session.client_secret, onSuccess })

3. Fulfil on checkout.completed. Verify easner-signature HMAC-SHA256 of "\${t}.\${rawBody}".
Metadata on the webhook will include ${JSON.stringify(recipe.metadataExample)}.
${recipe.mode === "subscription" ? "Also handle subscription.updated and subscription.canceled." : ""}
Do not send tax, appearance, or amount from the browser.`
}

export function recipeDebugPrompt(): string {
  return `Debug an Easner Checkout integration.
Check: secret key only on the server; POST /v1/checkout/sessions returns client_secret; browser uses js.easner.com/v1/checkout.js and mount("#easner-checkout", { publishableKey, clientSecret }); webhook verifies easner-signature; checkout.completed includes merchant metadata (no easner_* keys). Errors look like { error: { type, code, message } }.`
}

export const CHECKOUT_EVENT_CATALOG: Array<{ event: string; example: Record<string, unknown> }> = [
  {
    event: "checkout.completed",
    example: {
      type: "checkout.completed",
      data: {
        checkout_session_id: "cs_…",
        mode: "subscription",
        amount_cents: 4900,
        currency: "USD",
        customer_email: "user@example.com",
        subscription_id: "sub_…",
        metadata: { user_id: "123", plan: "pro" },
        paid_at: "2026-08-26T00:00:00.000Z",
        livemode: true,
      },
    },
  },
  {
    event: "subscription.updated",
    example: {
      type: "subscription.updated",
      data: { subscription_id: "sub_…", status: "active", metadata: { user_id: "123", plan: "pro" } },
    },
  },
  {
    event: "subscription.canceled",
    example: {
      type: "subscription.canceled",
      data: { subscription_id: "sub_…", status: "canceled", metadata: { user_id: "123", plan: "pro" } },
    },
  },
  {
    event: "payment.available",
    example: {
      type: "payment.available",
      data: { amount_cents: 4750, currency: "USD", available_at: "2026-08-28T00:00:00.000Z" },
    },
  },
]
