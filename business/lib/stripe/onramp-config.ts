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

/** v2 uses `/v1/crypto/onramp_quotes`. The old `/v1/crypto/onramp/quotes` path 400s with that header. */
export function stripeOnrampQuotesPath(version = getStripeOnrampBetaVersion()): string {
  return /crypto_onramp_beta=v2/i.test(version)
    ? "/v1/crypto/onramp_quotes"
    : "/v1/crypto/onramp/quotes"
}

export function getStripeLinkOAuthClientId(): string {
  return process.env.STRIPE_LINK_OAUTH_CLIENT_ID?.trim() || ""
}

export function getStripeLinkOAuthClientSecret(): string {
  return process.env.STRIPE_LINK_OAUTH_CLIENT_SECRET?.trim() || ""
}

/** Easner platform Stripe account — Link OAuth co-branding recipient. */
export const STRIPE_LINK_DATA_SHARING_MERCHANT_DEFAULT = "acct_1TRLDYFtxW9Zk3ZB"

/** Recipient business ID for Link OAuth co-branding (icon/name on Link identity). */
export function getStripeLinkDataSharingMerchant(): string {
  return (
    process.env.STRIPE_LINK_DATA_SHARING_MERCHANT?.trim() ||
    STRIPE_LINK_DATA_SHARING_MERCHANT_DEFAULT
  )
}

const LINK_OAUTH_SCOPE_ALIASES: Record<string, string> = {
  crypto_onramp: "crypto:ramp",
  "crypto.onramp": "crypto:ramp",
}

/** Official Link Auth scopes. login.link.com wants a comma-separated string, not an array. */
export const STRIPE_LINK_OAUTH_SCOPES_DEFAULT = [
  "kyc.status:read",
  "crypto:ramp",
  "auth.persist_login:read",
] as const

export function getStripeLinkOAuthScopes(): string {
  const raw = process.env.STRIPE_LINK_OAUTH_SCOPES?.trim()
  const parts = raw
    ? raw.split(/[\s,]+/).filter(Boolean)
    : [...STRIPE_LINK_OAUTH_SCOPES_DEFAULT]
  const scopes = new Set(parts.map((scope) => LINK_OAUTH_SCOPE_ALIASES[scope] || scope))
  for (const required of STRIPE_LINK_OAUTH_SCOPES_DEFAULT) scopes.add(required)
  return [...scopes].join(",")
}

export function getApplePayMerchantId(): string {
  return (
    process.env.NEXT_PUBLIC_APPLE_PAY_MERCHANT_ID?.trim() ||
    process.env.APPLE_PAY_MERCHANT_ID?.trim() ||
    "merchant.com.easner.mobile"
  )
}
