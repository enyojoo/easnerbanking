import Link from "next/link"
import { Card, CardContent } from "@/components/ui/card"
import { CheckoutCodeBlock } from "@/components/checkout/checkout-code-block"

const CURL_SESSION = `curl https://api.easner.com/v1/checkout/sessions \\
  -H "Authorization: Bearer easner_sk_test_…" \\
  -H "Content-Type: application/json" \\
  -H "Idempotency-Key: order_1042" \\
  -d '{
    "line_items": [{ "name": "Pro plan", "amount": 4900 }],
    "currency": "USD",
    "success_url": "https://shop.example.com/thanks?session_id={CHECKOUT_SESSION_ID}",
    "cancel_url": "https://shop.example.com/cart"
  }'`

const NODE_SESSION = `const response = await fetch("https://api.easner.com/v1/checkout/sessions", {
  method: "POST",
  headers: {
    Authorization: \`Bearer \${process.env.EASNER_SECRET_KEY}\`,
    "Content-Type": "application/json",
    // Retries with the same key return the first session instead of a duplicate.
    "Idempotency-Key": order.id,
  },
  body: JSON.stringify({
    line_items: [{ name: "Pro plan", amount: 4900 }], // amounts in cents
    currency: "USD",
    success_url: "https://shop.example.com/thanks?session_id={CHECKOUT_SESSION_ID}",
    cancel_url: "https://shop.example.com/cart",
  }),
})

const session = await response.json()
// session.client_secret → hand to the browser SDK
// session.checkout_session_id → keep with your order`

const INLINE_EMBED = `<script src="https://js.easner.com/checkout.js"></script>

<div id="easner-checkout"></div>

<script>
  EasnerCheckout.mount("#easner-checkout", {
    publishableKey: "easner_pk_test_…",
    clientSecret: clientSecretFromYourServer,
    onSuccess: function () {
      // Success is shown in place – route the customer on.
      window.location.href = "/thanks";
    },
    onError: function (error) {
      console.error(error);
    },
  });
</script>`

const OVERLAY_EMBED = `<script src="https://js.easner.com/checkout.js"></script>

<button id="buy">Buy now</button>

<script>
  document.getElementById("buy").addEventListener("click", function () {
    EasnerCheckout.open({
      publishableKey: "easner_pk_test_…",
      clientSecret: clientSecretFromYourServer,
      onSuccess: function () { window.location.href = "/thanks"; },
      onClose: function () { /* customer dismissed the overlay */ },
    });
  });
</script>`

function StepHeading({ step, title, blurb }: { step: number; title: string; blurb: string }) {
  return (
    <div className="space-y-1.5">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Step {step}
      </p>
      <h2 className="text-lg font-semibold text-foreground">{title}</h2>
      <p className="text-sm leading-relaxed text-muted-foreground">{blurb}</p>
    </div>
  )
}

export default function CheckoutQuickstartPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold text-foreground">Checkout quickstart</h1>
        <p className="text-muted-foreground mt-2 max-w-2xl">
          Accept a card, Apple Pay, or Google Pay payment on your own website. One server call
          creates a session, one script tag renders the form. About 10 minutes end to end.
        </p>
      </div>

      <Card>
        <CardContent className="flex flex-col gap-10 p-6 sm:p-8">
          <section className="flex flex-col gap-5">
            <StepHeading
              step={1}
              title="Add your website and get API keys"
              blurb="On the Checkout page, register the website that will host checkout and create your test keys. Return URLs and the embed only work on registered websites."
            />
            <ul className="list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-muted-foreground">
              <li>
                <span className="font-medium text-foreground">Publishable key</span>{" "}
                (easner_pk_test_…) goes in the browser. It is validated on every mount and only
                works on your registered domains.
              </li>
              <li>
                <span className="font-medium text-foreground">Secret key</span> (easner_sk_test_…)
                stays on your server and authenticates the sessions API. It is shown once – store
                it in an environment variable.
              </li>
            </ul>
            <p className="text-sm text-muted-foreground">
              <Link href="/checkout" className="font-medium text-primary hover:underline">
                Open the Checkout page
              </Link>{" "}
              to add your website and create keys.
            </p>
          </section>

          <section className="flex flex-col gap-5 border-t pt-10">
            <StepHeading
              step={2}
              title="Create a session from your server"
              blurb="Amounts always come from this server-to-server call, never from the browser. The response contains the client_secret your page needs."
            />
            <CheckoutCodeBlock label="curl" code={CURL_SESSION} />
            <CheckoutCodeBlock label="Node.js" code={NODE_SESSION} />
            <p className="text-sm leading-relaxed text-muted-foreground">
              line_items are fully honored – the session total is their sum, so you can omit
              amount. For a recurring charge send mode &quot;subscription&quot; with interval
              &quot;month&quot; or &quot;year&quot;. See the{" "}
              <Link href="/developers/checkout/api" className="font-medium text-primary hover:underline">
                API reference
              </Link>{" "}
              for every field.
            </p>
          </section>

          <section className="flex flex-col gap-5 border-t pt-10">
            <StepHeading
              step={3}
              title="Embed the payment form"
              blurb="Mount inline on your checkout page, or open an overlay from any button. Apple Pay and Google Pay appear automatically when the customer's device supports them."
            />
            <CheckoutCodeBlock label="Inline – EasnerCheckout.mount" code={INLINE_EMBED} />
            <CheckoutCodeBlock label="Overlay – EasnerCheckout.open" code={OVERLAY_EMBED} />
            <p className="text-sm leading-relaxed text-muted-foreground">
              With onSuccess, the confirmation is shown in place and no redirect happens – your
              handler decides what comes next. Without it, the browser redirects to the session&apos;s
              success URL. Logged-in apps can pass customerEmail and customerName so the form does
              not ask again. mount and open resolve to a controller with unmount() (and close() for
              the overlay).
            </p>
          </section>

          <section className="flex flex-col gap-5 border-t pt-10">
            <StepHeading
              step={4}
              title="Test the payment"
              blurb="With test keys, no real money moves. Use the test card to confirm the full flow."
            />
            <CheckoutCodeBlock label="Test card" code={`4242 4242 4242 4242   any future expiry   any CVC`} />
            <p className="text-sm leading-relaxed text-muted-foreground">
              Successful payments land in your Easner Balance. If you have configured{" "}
              <Link href="/developers/checkout/webhooks" className="font-medium text-primary hover:underline">
                webhooks
              </Link>
              , checkout.completed fires when the payment succeeds and payment.available when the
              funds are usable.
            </p>
          </section>

          <section className="flex flex-col gap-5 border-t pt-10">
            <StepHeading
              step={5}
              title="Go live"
              blurb="Create live keys on the Checkout page and swap them in – easner_sk_live_… on the server, easner_pk_live_… in the browser. Nothing else changes."
            />
            <p className="text-sm leading-relaxed text-muted-foreground">
              Every API response includes livemode so you can verify which mode a session was
              created in.
            </p>
          </section>
        </CardContent>
      </Card>
    </div>
  )
}
