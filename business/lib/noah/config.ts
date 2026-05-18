/**
 * Noah Business API — production configuration.
 * @see https://docs.noah.com/api-concepts/authentication/configuration
 */

import { loadNoahSigningKeyMaterial } from "./normalize-signing-key"

const NOAH_PRODUCTION_BASE_URL = "https://api.noah.com/v1"

function normalizeNoahBaseUrl(raw: string): string {
  try {
    const url = new URL(raw.startsWith("http") ? raw : `https://${raw}`)
    const path = url.pathname.replace(/\/$/, "") || "/"
    if (url.hostname === "api.noah.com" && path === "/") {
      return `${url.origin}/v1`
    }
  } catch {
    // ignore
  }
  return raw
}

export function getNoahBaseUrl(): string {
  const configured = process.env.NOAH_API_BASE_URL?.trim()
  const raw = (configured || NOAH_PRODUCTION_BASE_URL).replace(/\/$/, "")
  return normalizeNoahBaseUrl(raw)
}

export function getNoahUsdCryptoTicker(): string {
  return "USDC"
}

export function getNoahEurCryptoTicker(): string {
  return "EURC"
}

/** Default settlement asset for sell/offramp when `NOAH_SETTLEMENT_CRYPTO` is unset. */
export function getNoahSettlementCryptoCurrency(): string {
  return (process.env.NOAH_SETTLEMENT_CRYPTO || "USDC").trim()
}

export function getNoahApiKey(): string {
  return process.env.NOAH_API_KEY || ""
}

/** PEM EC private key for mandatory production `Api-Signature` (ES384 or ES256). */
export function getNoahSigningPrivateKey(): string {
  return process.env.NOAH_SIGNING_PRIVATE_KEY || ""
}

/**
 * Wallet-to-wallet (internal) transfer path. Noah documents vary by program; set explicitly when Noah confirms your contract.
 * @default /transactions/transfer
 */
export function getNoahWalletTransferPath(): string {
  return (process.env.NOAH_WALLET_TRANSFER_PATH || "/transactions/transfer").trim() || "/transactions/transfer"
}

/**
 * Hosted onboarding `ReturnURL` sent in `POST /v1/onboarding/:CustomerID` JSON body.
 * Noah requires a full URL including `https://` (not a path-only value).
 * @see https://docs.noah.com/recipes/onboarding/hosted-onboarding
 * @see https://docs.noah.com/api-reference/create-onboarding-session
 */
function assertHttpsReturnUrl(url: string, envName: string): string {
  const u = url.trim()
  if (!u) {
    throw new Error(`${envName} cannot be empty`)
  }
  if (!/^https:\/\//i.test(u)) {
    throw new Error(
      `${envName} must start with https:// — Noah expects a full ReturnURL including https (Hosted Onboarding: https://docs.noah.com/recipes/onboarding/hosted-onboarding)`
    )
  }
  return u
}

/** Consumer (Individual) hosted KYC — same value as `ReturnURL` in the Noah request. */
export function getNoahReturnUrl(): string {
  const raw = process.env.NOAH_ONBOARDING_RETURN_URL?.trim()
  if (!raw) {
    throw new Error(
      "NOAH_ONBOARDING_RETURN_URL is required — set it to the absolute https URL Noah should redirect to after hosted onboarding (see Noah Hosted Onboarding recipe)."
    )
  }
  return assertHttpsReturnUrl(raw, "NOAH_ONBOARDING_RETURN_URL")
}

/** KYB (Business) hosted onboarding; if unset, uses the same URL as consumer. */
export function getNoahBusinessReturnUrl(): string {
  const raw = process.env.NOAH_BUSINESS_ONBOARDING_RETURN_URL?.trim()
  if (!raw) {
    return getNoahReturnUrl()
  }
  return assertHttpsReturnUrl(raw, "NOAH_BUSINESS_ONBOARDING_RETURN_URL")
}

export function isNoahConfigured(): boolean {
  return Boolean(getNoahApiKey())
}

export function isNoahSigningConfigured(): boolean {
  return Boolean(getNoahSigningPrivateKey().trim())
}

/** Smoke / health diagnostics for production Noah wiring. */
export function getNoahProductionConfigIssues(): string[] {
  const issues: string[] = []
  if (!isNoahConfigured()) {
    issues.push("missing NOAH_API_KEY")
    return issues
  }
  const key = getNoahApiKey()
  if (!key.includes("_prod_")) {
    issues.push("NOAH_API_KEY should be a production key (apikey_prod_…)")
  }
  const base = getNoahBaseUrl().toLowerCase()
  if (!base.includes("api.noah.com")) {
    issues.push(`NOAH_API_BASE_URL must target production (got ${getNoahBaseUrl()})`)
  }
  if (!isNoahSigningConfigured()) {
    issues.push("missing NOAH_SIGNING_PRIVATE_KEY (required for production Api-Signature)")
  } else {
    try {
      loadNoahSigningKeyMaterial(getNoahSigningPrivateKey())
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      issues.push(`NOAH_SIGNING_PRIVATE_KEY invalid: ${msg}`)
    }
  }
  const settlement = getNoahSettlementCryptoCurrency()
  if (/_TEST$/i.test(settlement)) {
    issues.push(`NOAH_SETTLEMENT_CRYPTO must not use test assets (got ${settlement})`)
  }
  return issues
}
