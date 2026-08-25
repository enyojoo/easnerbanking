import { randomUUID } from "node:crypto"
import type { SupabaseClient } from "@supabase/supabase-js"
import type Stripe from "stripe"
import { dispatchMerchantWebhook } from "@/lib/checkout/merchant-webhooks"
import { getStripe } from "./client"
import { handleCheckoutCollectionCompleted } from "./handle-checkout-collection-completed"

function subscriptionIdFrom(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value.trim()
  if (value && typeof value === "object" && "id" in value) {
    const id = (value as { id?: unknown }).id
    return typeof id === "string" && id.trim() ? id.trim() : null
  }
  return null
}

async function resolveSubscriptionMetadata(
  subscriptionId: string,
): Promise<Record<string, string>> {
  try {
    const subscription = await getStripe().subscriptions.retrieve(subscriptionId)
    return (subscription.metadata ?? {}) as Record<string, string>
  } catch {
    return {}
  }
}

/**
 * Recurring Payment Links on Stripe Billing: settle each renewal through the shared
 * collection settlement path and mirror subscription changes to the merchant webhook.
 * The first invoice is already settled by `checkout.session.completed`; the unique
 * payment-intent constraint on `checkout_stripe_settlements` makes this idempotent.
 */
export async function handleSubscriptionLifecycleEvent(
  admin: SupabaseClient,
  event: Stripe.Event,
): Promise<{ handled: boolean }> {
  if (event.type === "invoice.paid" || event.type === "invoice.payment_failed") {
    const invoice = event.data.object as Stripe.Invoice & {
      subscription?: unknown
      payment_intent?: unknown
    }
    const subscriptionId = subscriptionIdFrom(invoice.subscription)
    const paymentIntentId = subscriptionIdFrom(invoice.payment_intent)
    if (!subscriptionId) return { handled: false }

    const metadata = await resolveSubscriptionMetadata(subscriptionId)
    const businessId = String(metadata.easner_business_id ?? "").trim()
    const source = String(metadata.easner_checkout_source ?? "").trim()
    if (!businessId || (source !== "payment_link" && source !== "embed")) {
      return { handled: false }
    }

    if (event.type === "invoice.payment_failed") {
      await dispatchMerchantWebhook(admin, {
        businessId,
        event: "checkout.failed",
        data: {
          subscription_id: subscriptionId,
          amount_cents: Math.round(Number(invoice.amount_due ?? 0)),
          currency: String(invoice.currency || "usd").toUpperCase(),
          reason: "A recurring payment could not be collected.",
          ...(metadata.easner_payment_link_id
            ? { payment_link_id: String(metadata.easner_payment_link_id) }
            : {}),
        },
      })
      return { handled: true }
    }

    if (!paymentIntentId) return { handled: false }

    return handleCheckoutCollectionCompleted(admin, event, {
      source,
      settlementId: randomUUID(),
      businessId,
      paymentIntentId,
      sessionId: null,
      subscriptionId,
      amountTotal: Math.round(Number(invoice.amount_paid ?? 0)),
      currency: String(invoice.currency || "usd"),
      customerEmail:
        typeof invoice.customer_email === "string" ? invoice.customer_email : null,
      customerName: typeof invoice.customer_name === "string" ? invoice.customer_name : null,
      sessionPaymentMethodTypes: null,
      paymentLinkId: String(metadata.easner_payment_link_id ?? "").trim() || null,
    })
  }

  const subscription = event.data.object as Stripe.Subscription
  const businessId = String(subscription.metadata?.easner_business_id ?? "").trim()
  if (!businessId) return { handled: false }

  await dispatchMerchantWebhook(admin, {
    businessId,
    event: event.type === "customer.subscription.deleted" ? "subscription.canceled" : "subscription.updated",
    data: {
      subscription_id: subscription.id,
      status: subscription.status,
      ...(subscription.metadata?.easner_payment_link_id
        ? { payment_link_id: String(subscription.metadata.easner_payment_link_id) }
        : {}),
    },
  })

  return { handled: true }
}
