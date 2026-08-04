/** Stripe invoice Pay online (platform MoR, no Connect). */

/**
 * Enabled automatically when secret + publishable keys are set.
 * Optional kill-switch: STRIPE_INVOICE_PAYMENTS_ENABLED=false
 */
export function isStripeInvoicePaymentsEnabled(): boolean {
  const flag = process.env.STRIPE_INVOICE_PAYMENTS_ENABLED?.trim().toLowerCase()
  if (flag === "false" || flag === "0" || flag === "off") {
    return false
  }
  return Boolean(getStripeSecretKey() && getStripePublishableKey())
}

export function getStripeSecretKey(): string {
  return process.env.STRIPE_SECRET_KEY?.trim() || ""
}

export function getStripePublishableKey(): string {
  return (
    process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY?.trim() ||
    process.env.STRIPE_PUBLISHABLE_KEY?.trim() ||
    ""
  )
}

export function getStripeWebhookSecret(): string {
  return process.env.STRIPE_WEBHOOK_SECRET?.trim() || ""
}
