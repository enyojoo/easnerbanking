/** Bridge.xyz API configuration. Production default: https://api.bridge.xyz (not sandbox). */

import {
  canonicalizeHostedOnboardingReturnUrl,
  getHostedOnboardingReturnUrl,
} from "@/lib/auth/hosted-onboarding-complete"

const BRIDGE_PRODUCTION_API_ORIGIN = "https://api.bridge.xyz"

export function getBridgeBaseUrl(): string {
  const raw = String(process.env.BRIDGE_BASE_URL ?? "").trim()
  return raw.replace(/\/+$/, "") || BRIDGE_PRODUCTION_API_ORIGIN
}

export function getBridgeApiKey(): string {
  return String(process.env.BRIDGE_API_KEY ?? "").trim()
}

export function getBridgeWebhookSecret(): string {
  return String(process.env.BRIDGE_WEBHOOK_SECRET ?? "").trim()
}

export function getBridgeWebhookPublicKey(): string | null {
  const pem = String(process.env.BRIDGE_WEBHOOK_PUBLIC_KEY ?? "").trim()
  return pem || null
}

/** TOS-only return. Must not look like KYC/KYB finished. */
export function getBridgeTosReturnUrl(): string {
  return getHostedOnboardingReturnUrl("bridge-tos")
}

/** Hosted individual KYC return. Shared with Noah and Grid. */
export function getBridgeKycReturnUrl(): string {
  const explicit = String(process.env.BRIDGE_KYC_RETURN_URL ?? "").trim()
  if (explicit) return canonicalizeHostedOnboardingReturnUrl(explicit)
  return getHostedOnboardingReturnUrl("kyc")
}

/** Hosted business KYB return. Shared with Noah and Grid. */
export function getBridgeBusinessKybReturnUrl(): string {
  const explicit = String(process.env.BRIDGE_BUSINESS_KYB_RETURN_URL ?? "").trim()
  if (explicit) return canonicalizeHostedOnboardingReturnUrl(explicit)
  return getHostedOnboardingReturnUrl("business")
}

export function isBridgeConfigured(): boolean {
  return Boolean(getBridgeApiKey())
}

export function getBridgeQuoteTtlMs(): number {
  const parsed = Number.parseInt(process.env.BRIDGE_QUOTE_TTL_MS || "900000", 10)
  if (!Number.isFinite(parsed) || parsed <= 0) return 15 * 60 * 1000
  return parsed
}

export function getBridgeCutoverWindDownDays(): number {
  const parsed = Number.parseInt(process.env.BRIDGE_CUTOVER_WIND_DOWN_DAYS || "14", 10)
  if (!Number.isFinite(parsed) || parsed < 7) return 14
  return Math.min(14, parsed)
}
