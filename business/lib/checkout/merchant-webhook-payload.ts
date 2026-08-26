import { publicMerchantMetadata } from "@/lib/stripe/checkout-session-metadata"

export type CheckoutCompletedWebhookData = {
  checkout_session_id: string | null
  mode: "payment" | "subscription"
  amount_cents: number
  currency: string
  customer_email: string | null
  subscription_id: string | null
  metadata: Record<string, string>
  paid_at: string
  livemode: boolean
  payment_link_id?: string
}

export function checkoutCompletedWebhookData(input: {
  checkoutSessionId: string | null
  mode?: string | null
  amountCents: number
  currency: string
  customerEmail?: string | null
  subscriptionId?: string | null
  metadata?: Record<string, unknown> | null
  paymentLinkId?: string | null
  paidAt: string
  livemode: boolean
}): CheckoutCompletedWebhookData {
  const mode = input.mode === "subscription" ? "subscription" : "payment"
  const payload: CheckoutCompletedWebhookData = {
    checkout_session_id: input.checkoutSessionId,
    mode,
    amount_cents: input.amountCents,
    currency: String(input.currency || "USD").toUpperCase(),
    customer_email: input.customerEmail?.trim() || null,
    subscription_id: input.subscriptionId?.trim() || null,
    metadata: publicMerchantMetadata(input.metadata),
    paid_at: input.paidAt,
    livemode: input.livemode,
  }
  if (input.paymentLinkId) payload.payment_link_id = input.paymentLinkId
  return payload
}

export function subscriptionLifecycleWebhookData(input: {
  subscriptionId: string
  status: string
  metadata?: Record<string, unknown> | null
  paymentLinkId?: string | null
}): Record<string, unknown> {
  return {
    subscription_id: input.subscriptionId,
    status: input.status,
    metadata: publicMerchantMetadata(input.metadata),
    ...(input.paymentLinkId ? { payment_link_id: input.paymentLinkId } : {}),
  }
}
