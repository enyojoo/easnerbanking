import type Stripe from "stripe"

/** Payer- and merchant-safe view of a Stripe subscription – no provider ids leak to buyers. */
export type SubscriptionSummary = {
  status: string
  amountCents: number
  currency: string
  interval: "month" | "year" | null
  currentPeriodEnd: string | null
  cancelAtPeriodEnd: boolean
  productLabel: string | null
  paymentMethod: { brand: string | null; last4: string | null } | null
}

export function summarizeSubscription(subscription: Stripe.Subscription): SubscriptionSummary {
  const item = subscription.items?.data?.[0]
  const price = item?.price
  const rawInterval = price?.recurring?.interval
  const paymentMethod =
    subscription.default_payment_method && typeof subscription.default_payment_method === "object"
      ? (subscription.default_payment_method as Stripe.PaymentMethod)
      : null
  const card = paymentMethod?.card ?? null
  const firstItem = subscription.items?.data?.[0] as
    | (Stripe.SubscriptionItem & { current_period_end?: number })
    | undefined
  const periodEnd =
    typeof (subscription as Stripe.Subscription & { current_period_end?: number })
      .current_period_end === "number"
      ? (subscription as Stripe.Subscription & { current_period_end?: number }).current_period_end
      : typeof firstItem?.current_period_end === "number"
        ? firstItem.current_period_end
        : null

  return {
    status: subscription.status,
    amountCents: Math.round(Number(price?.unit_amount ?? 0)),
    currency: String(price?.currency ?? "usd").toUpperCase(),
    interval: rawInterval === "month" || rawInterval === "year" ? rawInterval : null,
    currentPeriodEnd: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
    cancelAtPeriodEnd: Boolean(subscription.cancel_at_period_end),
    productLabel:
      typeof price?.nickname === "string" && price.nickname.trim() ? price.nickname.trim() : null,
    paymentMethod: card ? { brand: card.brand ?? null, last4: card.last4 ?? null } : null,
  }
}

/** True when the subscription belongs to this business (routing metadata check). */
export function subscriptionBelongsToBusiness(
  subscription: Stripe.Subscription,
  businessId: string,
): boolean {
  return String(subscription.metadata?.easner_business_id ?? "").trim() === businessId
}
