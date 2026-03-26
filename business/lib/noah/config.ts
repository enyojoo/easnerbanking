/**
 * Noah Business API — server-side config.
 * @see https://docs.noah.com/api-concepts/authentication/configuration
 */

export function getNoahBaseUrl(): string {
  return (process.env.NOAH_API_BASE_URL || "https://api.sandbox.noah.com/v1").replace(/\/$/, "")
}

export function getNoahApiKey(): string {
  return process.env.NOAH_API_KEY || ""
}

/** PEM ES384 private key for Api-Signature (required in production; sandbox optional depending on key setup). */
export function getNoahSigningPrivateKey(): string {
  return process.env.NOAH_SIGNING_PRIVATE_KEY || ""
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
