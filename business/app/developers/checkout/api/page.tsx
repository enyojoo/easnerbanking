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

const CREATE_REQUEST = `curl https://api.easner.com/v1/checkout/sessions \\
  -H "Authorization: Bearer easner_sk_test_…" \\
  -H "Content-Type: application/json" \\
  -H "Idempotency-Key: order_1042" \\
  -d '{
    "mode": "payment",
    "line_items": [
      { "name": "Pro plan", "amount": 4900, "quantity": 1, "description": "Annual license" }
    ],
    "currency": "USD",
    "customer_email": "buyer@example.com",
    "customer_name": "Buyer Name",
    "success_url": "https://shop.example.com/thanks?session_id={CHECKOUT_SESSION_ID}",
    "cancel_url": "https://shop.example.com/cart",
    "metadata": { "order_id": "1042" }
  }'`

const CREATE_RESPONSE = `{
  "client_secret": "cs_test_…_secret_…",
  "checkout_session_id": "cs_test_…",
  "amount": 4900,
  "currency": "USD",
  "mode": "payment",
  "customer_email": "buyer@example.com",
  "customer_name": "Buyer Name",
  "livemode": false
}`

const GET_REQUEST = `curl "https://api.easner.com/v1/checkout/sessions?id=cs_test_…" \\
  -H "Authorization: Bearer easner_sk_test_…"`

const GET_RESPONSE = `{
  "checkout_session_id": "cs_test_…",
  "status": "complete",
  "amount": 4900,
  "currency": "USD",
  "customer_email": "buyer@example.com",
  "customer_name": "Buyer Name",
  "completed_at": "2026-08-25T12:34:56.000Z",
  "mode": "payment",
  "livemode": false
}`

const ERROR_SHAPE = `{
  "error": "amount must be a positive integer in cents",
  "code": "amount_invalid",
  "type": "invalid_request_error"
}`

const requestFields: Array<{ field: string; type: string; description: string }> = [
  {
    field: "mode",
    type: "string, optional",
    description: 'Either "payment" (default) or "subscription".',
  },
  {
    field: "amount",
    type: "integer, conditional",
    description:
      "Total in cents. Optional when line_items is sent – the total is then their sum. If both are sent, amount must equal the line_items total or the request fails with amount_mismatch.",
  },
  {
    field: "currency",
    type: "string, optional",
    description: 'One of "USD" (default), "EUR", or "GBP".',
  },
  {
    field: "line_items",
    type: "array, conditional",
    description:
      "Up to 20 items, each fully honored on the payment page and receipt. Required unless amount is sent. Subscriptions support exactly one line item.",
  },
  {
    field: "customer_email",
    type: "string, optional",
    description:
      "Prefills the payer email. When set, the embedded form does not ask for an email again.",
  },
  {
    field: "customer_name",
    type: "string, optional",
    description: "Prefills the name on card in the embedded form.",
  },
  {
    field: "interval",
    type: "string, optional",
    description:
      'Subscriptions only: "month" (default) or "year". The billing period of the recurring charge.',
  },
  {
    field: "success_url",
    type: "string, optional",
    description:
      "Where the customer lands after paying (used when the embed has no onSuccess handler). Must be on a website registered on the Checkout page. {CHECKOUT_SESSION_ID} in the URL is replaced with the session id. Falls back to the website's configured success URL, then your account default.",
  },
  {
    field: "cancel_url",
    type: "string, optional",
    description:
      "Where the customer returns if they back out. Must be on a registered website. Falls back to the website's configured cancel URL, then your account default.",
  },
  {
    field: "metadata",
    type: "object, optional",
    description:
      "Your own reference data (such as an order id) stored on the session. Up to 20 string values; keys up to 40 characters, values up to 500 characters. Keys starting with easner_ are reserved and rejected.",
  },
]

const lineItemFields: Array<{ field: string; type: string; description: string }> = [
  {
    field: "name",
    type: "string, required",
    description: "Item name, 1–250 characters.",
  },
  {
    field: "amount",
    type: "integer, required",
    description: "Unit amount in cents. Must be a positive integer.",
  },
  {
    field: "quantity",
    type: "integer, optional",
    description: "1–999. Defaults to 1. The item subtotal is amount × quantity.",
  },
  {
    field: "description",
    type: "string, optional",
    description: "Shown under the item name on the payment page.",
  },
]

const errorTypes: Array<{ type: string; status: string; meaning: string }> = [
  { type: "invalid_request_error", status: "400, 404", meaning: "A parameter is missing or invalid." },
  { type: "authentication_error", status: "401", meaning: "The API key is missing, malformed, or revoked." },
  { type: "permission_error", status: "403", meaning: "The key is valid but not allowed to do this." },
  { type: "rate_limit_error", status: "429", meaning: "Too many requests – retry after the retry-after header." },
  { type: "idempotency_error", status: "400", meaning: "The Idempotency-Key header is invalid." },
  { type: "api_error", status: "5xx", meaning: "Something failed on Easner's side – safe to retry with the same Idempotency-Key." },
]

const errorCodes: Array<{ code: string; description: string }> = [
  { code: "invalid_api_key", description: "The Authorization header is missing, the key is unknown or revoked, or it lacks the checkout scope." },
  { code: "rate_limited", description: "Too many requests. Wait for the number of seconds in the retry-after header." },
  { code: "invalid_json", description: "The request body is not valid JSON." },
  { code: "mode_invalid", description: "mode must be payment or subscription." },
  { code: "amount_required", description: "Send amount in cents, or line_items." },
  { code: "amount_invalid", description: "amount must be a positive integer in cents." },
  { code: "amount_mismatch", description: "amount does not equal the line_items total." },
  { code: "currency_unsupported", description: "currency must be USD, EUR, or GBP." },
  { code: "line_items_invalid", description: "line_items must be an array." },
  { code: "line_items_too_many", description: "line_items supports up to 20 items." },
  { code: "line_items_subscription_single", description: "Subscriptions support a single line item." },
  { code: "line_item_name_invalid", description: "An item name is missing or longer than 250 characters." },
  { code: "line_item_amount_invalid", description: "An item amount is not a positive integer in cents." },
  { code: "line_item_quantity_invalid", description: "An item quantity is outside 1–999." },
  { code: "interval_invalid", description: "interval must be month or year." },
  { code: "metadata_invalid", description: "metadata must be an object of string values." },
  { code: "metadata_too_many_keys", description: "metadata supports up to 20 keys." },
  { code: "metadata_key_invalid", description: "A metadata key is empty or longer than 40 characters." },
  { code: "metadata_key_reserved", description: "Keys starting with easner_ are reserved by Easner." },
  { code: "metadata_value_too_long", description: "A metadata value is longer than 500 characters." },
  { code: "website_not_registered", description: "success_url or cancel_url was sent but no website is registered on the Checkout page." },
  { code: "url_not_allowed", description: "success_url or cancel_url is not on one of your registered websites." },
  { code: "idempotency_key_too_long", description: "Idempotency-Key must be at most 255 characters." },
  { code: "idempotent_replay_failed", description: "A session exists for this Idempotency-Key but could not be loaded – retry with a new key." },
  { code: "recurring_price_failed", description: "The recurring price for a subscription could not be created." },
  { code: "session_rejected", description: "The session was refused – the error message says why (for example, live payments not yet enabled)." },
  { code: "session_create_failed", description: "The session could not be created because of a server-side failure." },
  { code: "id_required", description: "GET requests must include the id query parameter." },
  { code: "session_not_found", description: "No checkout session with that id belongs to your account." },
]

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

export default function CheckoutApiReferencePage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold text-foreground">API reference</h1>
        <p className="text-muted-foreground mt-2 max-w-2xl">
          The checkout sessions API. Base URL https://api.easner.com – every request is
          authenticated with your secret key:{" "}
          <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
            Authorization: Bearer easner_sk_…
          </code>
          . Secret keys never belong in the browser.
        </p>
      </div>

      <SectionCard title="POST /v1/checkout/sessions">
        <p className="text-sm leading-relaxed text-muted-foreground">
          Creates a checkout session and returns the client_secret the browser SDK needs. Amounts
          are always taken from this server-to-server call, never from the browser. Returns 201 on
          success.
        </p>
        <CheckoutCodeBlock label="Request" code={CREATE_REQUEST} />

        <h3 className="text-sm font-semibold text-foreground">Request body</h3>
        <div className="overflow-hidden rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Field</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Description</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {requestFields.map((row) => (
                <TableRow key={row.field}>
                  <TableCell className="whitespace-nowrap align-top font-mono text-xs">
                    {row.field}
                  </TableCell>
                  <TableCell className="whitespace-nowrap align-top text-xs text-muted-foreground">
                    {row.type}
                  </TableCell>
                  <TableCell className="align-top text-sm text-muted-foreground">
                    {row.description}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        <h3 className="text-sm font-semibold text-foreground">line_items</h3>
        <p className="text-sm leading-relaxed text-muted-foreground">
          Every line item is honored as sent – name, unit amount, and quantity all appear on the
          payment page. The session total is the sum of amount × quantity across items.
        </p>
        <div className="overflow-hidden rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Field</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Description</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {lineItemFields.map((row) => (
                <TableRow key={row.field}>
                  <TableCell className="whitespace-nowrap align-top font-mono text-xs">
                    {row.field}
                  </TableCell>
                  <TableCell className="whitespace-nowrap align-top text-xs text-muted-foreground">
                    {row.type}
                  </TableCell>
                  <TableCell className="align-top text-sm text-muted-foreground">
                    {row.description}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        <h3 className="text-sm font-semibold text-foreground">Response</h3>
        <CheckoutCodeBlock label="201 Created" code={CREATE_RESPONSE} />
        <p className="text-sm leading-relaxed text-muted-foreground">
          Pass client_secret to EasnerCheckout.mount or EasnerCheckout.open in the browser, and
          keep checkout_session_id with your order so you can match webhooks and query status
          later. livemode tells you whether a live key created the session.
        </p>
      </SectionCard>

      <SectionCard title="Idempotency">
        <p className="text-sm leading-relaxed text-muted-foreground">
          Send an{" "}
          <code className="rounded bg-muted px-1.5 py-0.5 text-xs">Idempotency-Key</code> header
          (up to 255 characters, unique per session you intend to create – an order id works well)
          to make retries safe. Repeating a request with the same key returns the session created
          by the first call with status 200 and{" "}
          <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
            &quot;idempotent_replay&quot;: true
          </code>{" "}
          instead of opening a duplicate. Keys are scoped to your account.
        </p>
      </SectionCard>

      <SectionCard title="GET /v1/checkout/sessions?id=…">
        <p className="text-sm leading-relaxed text-muted-foreground">
          Reads the current state of a session – useful on your order confirmation page. status is
          one of{" "}
          <code className="rounded bg-muted px-1.5 py-0.5 text-xs">open</code> (awaiting payment),{" "}
          <code className="rounded bg-muted px-1.5 py-0.5 text-xs">processing</code> (a delayed
          method such as bank debit is pending),{" "}
          <code className="rounded bg-muted px-1.5 py-0.5 text-xs">complete</code> (paid), or{" "}
          <code className="rounded bg-muted px-1.5 py-0.5 text-xs">failed</code>. completed_at is
          null until the payment completes.
        </p>
        <CheckoutCodeBlock label="Request" code={GET_REQUEST} />
        <CheckoutCodeBlock label="200 OK" code={GET_RESPONSE} />
      </SectionCard>

      <SectionCard title="Errors">
        <p className="text-sm leading-relaxed text-muted-foreground">
          Every error response has the same shape: a human-readable error message, plus a stable
          code and type for your programs.
        </p>
        <CheckoutCodeBlock label="Error shape" code={ERROR_SHAPE} />
        <div className="overflow-hidden rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Type</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Meaning</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {errorTypes.map((row) => (
                <TableRow key={row.type}>
                  <TableCell className="whitespace-nowrap align-top font-mono text-xs">
                    {row.type}
                  </TableCell>
                  <TableCell className="whitespace-nowrap align-top text-xs text-muted-foreground">
                    {row.status}
                  </TableCell>
                  <TableCell className="align-top text-sm text-muted-foreground">
                    {row.meaning}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <h3 className="text-sm font-semibold text-foreground">Error codes</h3>
        <div className="overflow-hidden rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Code</TableHead>
                <TableHead>Description</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {errorCodes.map((row) => (
                <TableRow key={row.code}>
                  <TableCell className="whitespace-nowrap align-top font-mono text-xs">
                    {row.code}
                  </TableCell>
                  <TableCell className="align-top text-sm text-muted-foreground">
                    {row.description}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </SectionCard>

      <SectionCard title="Rate limiting">
        <p className="text-sm leading-relaxed text-muted-foreground">
          Requests are limited to 120 per minute per API key. Above that the API returns 429 with
          code{" "}
          <code className="rounded bg-muted px-1.5 py-0.5 text-xs">rate_limited</code> and a{" "}
          <code className="rounded bg-muted px-1.5 py-0.5 text-xs">retry-after</code> header
          giving the number of seconds to wait. Retry with the same Idempotency-Key – you will
          never create a duplicate session.
        </p>
      </SectionCard>
    </div>
  )
}
