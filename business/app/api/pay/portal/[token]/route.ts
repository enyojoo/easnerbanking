import { NextResponse } from "next/server"
import { getStripePublishableKey } from "@/lib/stripe/config"
import { getStripe } from "@/lib/stripe/client"
import { resolvePortalToken } from "@/lib/subscriptions/portal-tokens"
import { subscriptionBelongsToBusiness, summarizeSubscription } from "@/lib/subscriptions/summary"
import { createSupabaseAdmin } from "@/lib/supabase/admin"

type Ctx = { params: Promise<{ token: string }> }

/**
 * Buyer self-serve portal, addressed by an expiring token (the URL is the
 * capability – no sign-in). Read the subscription, cancel it, or update the
 * card via a SetupIntent.
 */
export async function GET(_request: Request, context: Ctx) {
  const { token } = await context.params
  const admin = createSupabaseAdmin()
  const resolved = await resolvePortalToken(admin, token)
  if (!resolved) {
    return NextResponse.json({ error: "This link has expired. Ask the business for a new one." }, { status: 404 })
  }

  try {
    const subscription = await getStripe().subscriptions.retrieve(resolved.stripeSubscriptionId, {
      expand: ["default_payment_method"],
    })
    if (!subscriptionBelongsToBusiness(subscription, resolved.businessId)) {
      return NextResponse.json({ error: "This link is no longer valid." }, { status: 404 })
    }

    const { data: biz } = await admin
      .from("businesses")
      .select("name")
      .eq("id", resolved.businessId)
      .maybeSingle()

    return NextResponse.json({
      businessName: typeof biz?.name === "string" ? biz.name : "",
      customerEmail: resolved.customerEmail || null,
      subscription: summarizeSubscription(subscription),
    })
  } catch {
    return NextResponse.json({ error: "This subscription could not be loaded." }, { status: 502 })
  }
}

export async function POST(request: Request, context: Ctx) {
  const { token } = await context.params
  const admin = createSupabaseAdmin()
  const resolved = await resolvePortalToken(admin, token)
  if (!resolved) {
    return NextResponse.json({ error: "This link has expired. Ask the business for a new one." }, { status: 404 })
  }

  const body = (await request.json().catch(() => null)) as {
    action?: "cancel" | "setup_intent" | "set_payment_method"
    setup_intent_id?: string
  } | null

  const stripe = getStripe()
  let subscription
  try {
    subscription = await stripe.subscriptions.retrieve(resolved.stripeSubscriptionId)
  } catch {
    return NextResponse.json({ error: "This subscription could not be loaded." }, { status: 502 })
  }
  if (!subscriptionBelongsToBusiness(subscription, resolved.businessId)) {
    return NextResponse.json({ error: "This link is no longer valid." }, { status: 404 })
  }
  const customerId =
    typeof subscription.customer === "string" ? subscription.customer : subscription.customer?.id
  if (!customerId) {
    return NextResponse.json({ error: "This subscription could not be loaded." }, { status: 502 })
  }

  try {
    switch (body?.action) {
      case "cancel": {
        // Payer cancels take effect at period end – they keep what they paid for.
        const updated = await stripe.subscriptions.update(resolved.stripeSubscriptionId, {
          cancel_at_period_end: true,
        })
        return NextResponse.json({ ok: true, status: updated.status, cancelAtPeriodEnd: true })
      }
      case "setup_intent": {
        const setupIntent = await stripe.setupIntents.create({
          customer: customerId,
          usage: "off_session",
          metadata: {
            easner_business_id: resolved.businessId,
            easner_subscription_id: resolved.stripeSubscriptionId,
          },
        })
        return NextResponse.json({
          client_secret: setupIntent.client_secret,
          publishable_key: getStripePublishableKey(),
        })
      }
      case "set_payment_method": {
        const setupIntentId = String(body?.setup_intent_id ?? "").trim()
        if (!setupIntentId) {
          return NextResponse.json({ error: "setup_intent_id is required" }, { status: 400 })
        }
        const setupIntent = await stripe.setupIntents.retrieve(setupIntentId)
        const belongs =
          String(setupIntent.metadata?.easner_subscription_id ?? "") === resolved.stripeSubscriptionId
        const paymentMethodId =
          typeof setupIntent.payment_method === "string"
            ? setupIntent.payment_method
            : setupIntent.payment_method?.id
        if (!belongs || setupIntent.status !== "succeeded" || !paymentMethodId) {
          return NextResponse.json({ error: "The new payment method was not confirmed" }, { status: 409 })
        }
        await stripe.subscriptions.update(resolved.stripeSubscriptionId, {
          default_payment_method: paymentMethodId,
        })
        return NextResponse.json({ ok: true })
      }
      default:
        return NextResponse.json({ error: "Unknown action" }, { status: 400 })
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : "That did not work – try again"
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
