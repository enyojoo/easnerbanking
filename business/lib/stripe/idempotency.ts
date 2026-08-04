/** Idempotency key helpers for Stripe invoice checkout + settlement. */

export function stripeCheckoutIdempotencyKey(invoiceId: string, settlementId: string): string {
  return `inv_checkout_${invoiceId}_${settlementId}`
}

export function stripeWebhookEventKey(eventId: string): string {
  return String(eventId || "").trim()
}
