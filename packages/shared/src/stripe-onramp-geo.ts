/** Stripe Embedded Components onramp payer geo. GB is never included in v1. */

export const STRIPE_ONRAMP_EU27_ISO2 = [
  "AT",
  "BE",
  "BG",
  "HR",
  "CY",
  "CZ",
  "DK",
  "EE",
  "FI",
  "FR",
  "DE",
  "GR",
  "HU",
  "IE",
  "IT",
  "LV",
  "LT",
  "LU",
  "MT",
  "NL",
  "PL",
  "PT",
  "RO",
  "SK",
  "SI",
  "ES",
  "SE",
] as const

const EU27 = new Set<string>(STRIPE_ONRAMP_EU27_ISO2)

export const STRIPE_ONRAMP_BLOCKED_US_STATES = new Set(["NY"])

export type StripeOnrampPayerGeoInput = {
  country?: string | null
  state?: string | null
  euEnabled?: boolean
}

export function normalizeIso2(value: string | null | undefined): string | null {
  const s = String(value ?? "").trim().toUpperCase()
  return /^[A-Z]{2}$/.test(s) ? s : null
}

export function normalizeUsState(value: string | null | undefined): string | null {
  const s = String(value ?? "").trim().toUpperCase()
  if (!s) return null
  if (s === "NEW YORK") return "NY"
  if (/^[A-Z]{2}$/.test(s)) return s
  return s.slice(0, 2)
}

export function isStripeOnrampEuCountry(country: string | null | undefined): boolean {
  const iso = normalizeIso2(country)
  return iso != null && EU27.has(iso)
}

/** Payer residence eligible for Express deposits (Stripe onramp). EU-27 is on unless `euEnabled` is false. */
export function isStripeOnrampPayerEligible(input: StripeOnrampPayerGeoInput): boolean {
  const country = normalizeIso2(input.country)
  if (!country || country === "GB") return false
  if (country === "US") {
    const state = normalizeUsState(input.state)
    if (state && STRIPE_ONRAMP_BLOCKED_US_STATES.has(state)) return false
    return true
  }
  const euEnabled = input.euEnabled !== false
  if (euEnabled && isStripeOnrampEuCountry(country)) return true
  return false
}

export function stripeOnrampAchAvailable(input: StripeOnrampPayerGeoInput): boolean {
  return normalizeIso2(input.country) === "US" && isStripeOnrampPayerEligible(input)
}

/** Payer residence first (org owner on business). KYC address country is fallback only. */
export function expressDepositsPayerCountry(input: {
  residenceCountry?: string | null
  kycAddressCountry?: string | null
}): string | null {
  return normalizeIso2(input.residenceCountry) ?? normalizeIso2(input.kycAddressCountry)
}

/** US payers pay USD. EU-27 payers pay EUR. */
export function expressDepositsSourceCurrency(
  country: string | null | undefined,
): "usd" | "eur" | null {
  const iso = normalizeIso2(country)
  if (!iso) return null
  if (iso === "US") return "usd"
  if (isStripeOnrampEuCountry(iso)) return "eur"
  return null
}
