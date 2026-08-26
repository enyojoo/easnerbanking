import { NextResponse } from "next/server"
import type Stripe from "stripe"
import { getStripe } from "@/lib/stripe/client"
import { getStripeWebhookSecret, isStripeInvoicePaymentsEnabled } from "@/lib/stripe/config"
import { recordStripeWebhookDelivery } from "@/lib/stripe/process-webhook"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function verifyStripeWebhook(raw: Buffer, sig: string, secrets: string[]): Stripe.Event {
  const unique = [...new Set(secrets.map((s) => s.trim()).filter(Boolean))]
  let lastError: Error | null = null
  for (const secret of unique) {
    try {
      return getStripe().webhooks.constructEvent(raw, sig, secret)
    } catch (err) {
      lastError = err instanceof Error ? err : new Error("Invalid signature")
    }
  }
  throw lastError ?? new Error("Invalid signature")
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    endpoint: "stripe-webhooks",
    enabled: isStripeInvoicePaymentsEnabled(),
    webhookSecretConfigured: Boolean(getStripeWebhookSecret(true) || getStripeWebhookSecret(false)),
  })
}

export async function POST(request: Request) {
  const liveSecret = getStripeWebhookSecret(true)
  const testSecret = getStripeWebhookSecret(false)
  if (!liveSecret && !testSecret) {
    return NextResponse.json({ error: "STRIPE_WEBHOOK_SECRET not configured" }, { status: 503 })
  }

  const raw = Buffer.from(await request.arrayBuffer())
  const sig = request.headers.get("stripe-signature")
  if (!sig) {
    return NextResponse.json({ error: "Missing stripe-signature header" }, { status: 401 })
  }

  let event: Stripe.Event
  try {
    event = verifyStripeWebhook(raw, sig, [liveSecret, testSecret])
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Invalid signature"
    console.warn("[stripe-webhook] verification failed", msg)
    return NextResponse.json({ error: msg }, { status: 401 })
  }

  try {
    const result = await recordStripeWebhookDelivery(event)
    return NextResponse.json({ ok: true, skipped: result.skipped, type: event.type })
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    console.error("[stripe-webhook] processing failed", event.type, msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
