/** Checkout channel for collections analytics (Stripe online checkout). */
export type CheckoutChannel = "embed" | "payment_link" | "invoice"

export function checkoutChannelFromSource(source: string | null | undefined): CheckoutChannel | null {
  const value = String(source ?? "").trim()
  if (value === "embed" || value === "payment_link" || value === "invoice") return value
  return null
}

export function checkoutAnalyticsProperties(input: {
  channel: CheckoutChannel
  businessId: string
  settlementId?: string | null
  currency?: string | null
  amountCents?: number | null
  paymentLinkId?: string | null
  invoiceId?: string | null
  livemode?: boolean | null
  rail?: string | null
}): Record<string, unknown> {
  return {
    channel: input.channel,
    easner_business_id: input.businessId,
    ...(input.settlementId ? { settlement_id: input.settlementId } : {}),
    ...(input.currency ? { currency: input.currency } : {}),
    ...(typeof input.amountCents === "number" && Number.isFinite(input.amountCents)
      ? { amount_cents: input.amountCents }
      : {}),
    ...(input.paymentLinkId ? { payment_link_id: input.paymentLinkId } : {}),
    ...(input.invoiceId ? { invoice_id: input.invoiceId } : {}),
    ...(typeof input.livemode === "boolean" ? { livemode: input.livemode } : {}),
    ...(input.rail ? { rail: input.rail } : {}),
  }
}
