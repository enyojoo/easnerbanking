import { getStripePublishableKey, getStripeSecretKey } from "./config"

function envOff(name: string): boolean {
  const v = String(process.env[name] || "").trim().toLowerCase()
  return v === "false" || v === "0" || v === "off"
}

/**
 * On when platform Stripe keys are set (same pattern as invoice Pay online).
 * Optional kill-switch: STRIPE_ONRAMP_ENABLED=false
 */
export function isStripeOnrampEnabled(): boolean {
  if (envOff("STRIPE_ONRAMP_ENABLED")) return false
  return Boolean(getStripeSecretKey() && getStripePublishableKey())
}

/**
 * EU-27 payers included whenever Express deposits is on.
 * Optional kill-switch: STRIPE_ONRAMP_EU_ENABLED=false
 */
export function isStripeOnrampEuEnabled(): boolean {
  if (envOff("STRIPE_ONRAMP_EU_ENABLED")) return false
  return isStripeOnrampEnabled()
}

export function getStripeOnrampBetaVersion(): string {
  return (
    process.env.STRIPE_ONRAMP_API_VERSION?.trim() ||
    "2026-07-29.dahlia;crypto_onramp_beta=v2"
  )
}

export function getStripeLinkOAuthClientId(): string {
  return process.env.STRIPE_LINK_OAUTH_CLIENT_ID?.trim() || ""
}

export function getStripeLinkOAuthClientSecret(): string {
  return process.env.STRIPE_LINK_OAUTH_CLIENT_SECRET?.trim() || ""
}

/** Space-separated scopes. login.link.com rejects arrays (`oauth_scopes must be a string`). */
export function getStripeLinkOAuthScopes(): string {
  const raw = process.env.STRIPE_LINK_OAUTH_SCOPES?.trim()
  const scopes = raw
    ? raw.split(/[\s,]+/).filter(Boolean)
    : ["crypto_onramp", "auth.persist_login:read"]
  return scopes.join(" ")
}

export function getApplePayMerchantId(): string {
  return (
    process.env.NEXT_PUBLIC_APPLE_PAY_MERCHANT_ID?.trim() ||
    process.env.APPLE_PAY_MERCHANT_ID?.trim() ||
    "merchant.com.easner.mobile"
  )
}
