export function effectivePayInCountry(input: {
  businessCountryCode?: string | null
  userResidenceCountry?: string | null
}): string | null {
  const business = String(input.businessCountryCode ?? "").trim().toUpperCase()
  if (business) return business
  const residence = String(input.userResidenceCountry ?? "").trim().toUpperCase()
  return residence || null
}
