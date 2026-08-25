/** Stripe invoice Pay online (platform MoR + Connect destination charges). */

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

/**
 * Connect destination charges are built-in whenever invoice Pay online is enabled.
 * Merchants must complete Connect onboarding + Grid VA payout link before checkout.
 */
export function isStripeConnectEnabled(): boolean {
  return isStripeInvoicePaymentsEnabled()
}

/**
 * Same rail as invoice Pay online – used by Payment Links and the website embed.
 * Optional kill-switch: ONLINE_CHECKOUT_ENABLED=false turns off Collections
 * without disabling invoice Pay online.
 */
export function isOnlineCheckoutEnabled(): boolean {
  const flag = process.env.ONLINE_CHECKOUT_ENABLED?.trim().toLowerCase()
  if (flag === "false" || flag === "0" || flag === "off") {
    return false
  }
  return isStripeInvoicePaymentsEnabled()
}

/** Platform application fee in basis points (built-in: 0 for v1). */
export function getStripePlatformFeeBps(): number {
  return 0
}

/**
 * Stripe Tax on one-time Collections charges (platform = merchant of record, so
 * tax is calculated and owed by the platform). Requires Stripe Tax activated on
 * the platform Dashboard with an origin address – hence opt-in:
 * CHECKOUT_STRIPE_TAX_ENABLED=true
 */
export function isStripeTaxEnabled(): boolean {
  const flag = process.env.CHECKOUT_STRIPE_TAX_ENABLED?.trim().toLowerCase()
  return flag === "true" || flag === "1" || flag === "on"
}

export type StripePayoutMode = "scheduled" | "manual"

/** Connected-account payout schedule (built-in: daily / scheduled). */
export function getStripePayoutMode(): StripePayoutMode {
  return "scheduled"
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

export { isStripeOnrampEnabled, isStripeOnrampEuEnabled, getApplePayMerchantId } from "./onramp-config"
