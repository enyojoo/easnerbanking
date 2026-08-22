import { localPayInCountries } from "@easner/shared"

/** Payer (org owner) residence for Stripe Express deposits and KYC. */
export function payerPayInCountry(input: {
  userResidenceCountry?: string | null
}): string | null {
  const residence = String(input.userResidenceCountry ?? "").trim().toUpperCase()
  return /^[A-Z]{2}$/.test(residence) ? residence : null
}

/**
 * Last-resort single country. Business wins. Do not use for YC/Grid local or Stripe
 * payer rails — use {@link localPayInCountries} or {@link payerPayInCountry}.
 */
export function effectivePayInCountry(input: {
  businessCountryCode?: string | null
  userResidenceCountry?: string | null
}): string | null {
  const business = String(input.businessCountryCode ?? "").trim().toUpperCase()
  if (business) return business
  const residence = String(input.userResidenceCountry ?? "").trim().toUpperCase()
  return residence || null
}

export { localPayInCountries }
