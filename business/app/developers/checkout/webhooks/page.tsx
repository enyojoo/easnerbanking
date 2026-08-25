import Link from "next/link"
import { Card, CardContent } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { CheckoutCodeBlock } from "@/components/checkout/checkout-code-block"

const events: Array<{ event: string; description: string }> = [
  { event: "checkout.completed", description: "Payment succeeded – safe to fulfil the order." },
  { event: "checkout.async_succeeded", description: "A delayed method (such as bank debit) finally cleared." },
  { event: "checkout.failed", description: "The payment attempt failed or was abandoned." },
  { event: "payment.available", description: "Funds landed in the Easner Balance and are available to use." },
  { event: "subscription.updated", description: "A recurring payment renewed or its plan changed." },
  { event: "subscription.canceled", description: "A recurring payment was cancelled." },
]

const PAYLOAD_EXAMPLE = `{
  "type": "checkout.completed",
  "created": 1756123456,
  "data": {
    "checkout_session_id": "cs_test_…",
    "amount_cents": 4900,
    "currency": "USD",
    "customer_email": "buyer@example.com",
    "paid_at": "2026-08-25T12:34:56.000Z",
    "livemode": false
  }
}`

const VERIFY_NODE = `const crypto = require("node:crypto");
const express = require("express");

const app = express();

// Verify against the raw body – parsing and re-serializing changes the bytes.
app.post("/webhooks/easner", express.raw({ type: "application/json" }), (req, res) => {
  const secret = process.env.EASNER_WEBHOOK_SECRET; // easner_whsec_…
  const body = req.body.toString("utf8");

  // Easner-Signature: t=<unix seconds>,v1=<hex hmac-sha256 of "<t>.<body>">
  const parts = Object.fromEntries(
    (req.header("Easner-Signature") || "").split(",").map((pair) => pair.split("=", 2)),
  );
  const timestamp = Number(parts.t);
  const expected = crypto
    .createHmac("sha256", secret)
    .update(parts.t + "." + body, "utf8")
    .digest("hex");

  const fresh =
    Number.isFinite(timestamp) &&
    Math.abs(Date.now() / 1000 - timestamp) < 300; // 5-minute tolerance
  const valid =
    fresh &&
    typeof parts.v1 === "string" &&
    parts.v1.length === expected.length &&
    crypto.timingSafeEqual(Buffer.from(parts.v1, "hex"), Buffer.from(expected, "hex"));

  if (!valid) return res.status(400).send("Invalid signature");

  const event = JSON.parse(body); // { type, created, data }
  switch (event.type) {
    case "checkout.completed":
      // Fulfil the order for event.data.checkout_session_id.
      break;
    case "payment.available":
      // Funds are usable in your Easner Balance.
      break;
  }

  // Acknowledge quickly – do slow work after responding.
  res.status(200).send("ok");
});`

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-5 p-6 sm:p-8">
        <h2 className="text-lg font-semibold text-foreground">{title}</h2>
        {children}
      </CardContent>
    </Card>
  )
}

export default function CheckoutWebhooksPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold text-foreground">Webhooks</h1>
        <p className="text-muted-foreground mt-2 max-w-2xl">
          Easner POSTs a signed JSON event to your endpoint when something happens to a payment or
          subscription. Configure the endpoint URL and signing secret on the{" "}
          <Link href="/checkout" className="font-medium text-primary hover:underline">
            Checkout page
          </Link>
          . The secret (easner_whsec_…) is shown once – store it in an environment variable.
        </p>
      </div>

      <SectionCard title="Events">
        <div className="overflow-hidden rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Event</TableHead>
                <TableHead>When it fires</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {events.map((row) => (
                <TableRow key={row.event}>
                  <TableCell className="whitespace-nowrap align-top font-mono text-xs">
                    {row.event}
                  </TableCell>
                  <TableCell className="align-top text-sm text-muted-foreground">
                    {row.description}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <p className="text-sm leading-relaxed text-muted-foreground">
          Fulfil orders on checkout.completed (or checkout.async_succeeded for delayed methods).
          payment.available fires later, once the funds are usable in your Easner Balance.
        </p>
      </SectionCard>

      <SectionCard title="Payload">
        <p className="text-sm leading-relaxed text-muted-foreground">
          Every delivery is an HTTP POST with a JSON body of the shape{" "}
          <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
            {"{ type, created, data }"}
          </code>{" "}
          – created is a Unix timestamp in seconds and data carries the event-specific fields. Two
          headers accompany it:{" "}
          <code className="rounded bg-muted px-1.5 py-0.5 text-xs">Easner-Event</code> (the event
          name) and{" "}
          <code className="rounded bg-muted px-1.5 py-0.5 text-xs">Easner-Signature</code> (see
          below).
        </p>
        <CheckoutCodeBlock label="Example: checkout.completed" code={PAYLOAD_EXAMPLE} />
      </SectionCard>

      <SectionCard title="Verifying signatures">
        <p className="text-sm leading-relaxed text-muted-foreground">
          The{" "}
          <code className="rounded bg-muted px-1.5 py-0.5 text-xs">Easner-Signature</code> header
          has the form{" "}
          <code className="rounded bg-muted px-1.5 py-0.5 text-xs">t=&lt;unix&gt;,v1=&lt;hex&gt;</code>
          , where v1 is the hex HMAC-SHA256 of the string{" "}
          <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
            &quot;&lt;t&gt;.&lt;body&gt;&quot;
          </code>{" "}
          computed with your easner_whsec_… secret. Recompute it over the raw request body, compare
          with a timing-safe comparison, and reject timestamps older than about 5 minutes to block
          replays. Retries are re-signed with a fresh timestamp, so a valid delivery is never stale.
        </p>
        <CheckoutCodeBlock label="Node.js (Express)" code={VERIFY_NODE} />
      </SectionCard>

      <SectionCard title="Retries and redelivery">
        <p className="text-sm leading-relaxed text-muted-foreground">
          Respond with any 2xx status within 8 seconds to acknowledge a delivery. Anything else –
          an error status, a timeout, an unreachable host – is retried automatically on a backoff
          schedule: 1 minute, 5 minutes, 30 minutes, 2 hours, 6 hours, then 24 hours after the
          initial attempt. When the schedule is exhausted the delivery is marked failed.
        </p>
        <p className="text-sm leading-relaxed text-muted-foreground">
          Every delivery, including failed ones, can be redelivered manually from the Checkout
          page. If you rotate your signing secret or move your endpoint, retries and redeliveries
          use the current settings automatically.
        </p>
      </SectionCard>
    </div>
  )
}
