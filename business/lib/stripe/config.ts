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

export type StripePayoutMode = "scheduled" | "manual"

/** Connected-account payout schedule (built-in: daily / scheduled). */
export function getStripePayoutMode(): StripePayoutMode {
  return "scheduled"
}

function isStripeTestCredential(value: string): boolean {
  return /(?:^|_)test_/.test(value)
}

function defaultStripeSecretKey(): string {
  return process.env.STRIPE_SECRET_KEY?.trim() || ""
}

function defaultStripePublishableKey(): string {
  return (
    process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY?.trim() ||
    process.env.STRIPE_PUBLISHABLE_KEY?.trim() ||
    ""
  )
}

/**
 * Platform Stripe secret. Pass `false` for merchant test keys so Checkout hits
 * Stripe test mode (4242, etc.) instead of the live key.
 */
export function getStripeSecretKey(livemode: boolean = true): string {
  if (!livemode) {
    const dedicated = process.env.STRIPE_TEST_SECRET_KEY?.trim() || ""
    if (dedicated) return dedicated
    const fallback = defaultStripeSecretKey()
    return isStripeTestCredential(fallback) ? fallback : ""
  }
  const primary = defaultStripeSecretKey()
  if (!isStripeTestCredential(primary)) return primary
  return process.env.STRIPE_LIVE_SECRET_KEY?.trim() || primary
}

/**
 * Platform Stripe publishable key. Pass `false` when the merchant key is `easner_pk_test_…`.
 */
export function getStripePublishableKey(livemode: boolean = true): string {
  if (!livemode) {
    const dedicated =
      process.env.NEXT_PUBLIC_STRIPE_TEST_PUBLISHABLE_KEY?.trim() ||
      process.env.STRIPE_TEST_PUBLISHABLE_KEY?.trim() ||
      ""
    if (dedicated) return dedicated
    const fallback = defaultStripePublishableKey()
    return isStripeTestCredential(fallback) ? fallback : ""
  }
  const primary = defaultStripePublishableKey()
  if (!isStripeTestCredential(primary)) return primary
  return process.env.NEXT_PUBLIC_STRIPE_LIVE_PUBLISHABLE_KEY?.trim() || primary
}

export function isStripeTestPaymentsConfigured(): boolean {
  return Boolean(getStripeSecretKey(false) && getStripePublishableKey(false))
}

export function getStripeWebhookSecret(livemode: boolean = true): string {
  if (!livemode) {
    return process.env.STRIPE_TEST_WEBHOOK_SECRET?.trim() || ""
  }
  return process.env.STRIPE_WEBHOOK_SECRET?.trim() || ""
}

export { isStripeOnrampEnabled, isStripeOnrampEuEnabled, getApplePayMerchantId } from "./onramp-config"
