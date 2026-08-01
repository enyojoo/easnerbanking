export type GridBusinessProfile = {
  legalName: string
  registrationNumber?: string | null
  taxId?: string | null
  country?: string | null
  addressLine1?: string | null
  city?: string | null
  state?: string | null
  postalCode?: string | null
  email?: string | null
  website?: string | null
}

/** Build Grid BUSINESS customer payload for hosted KYB. */
export function buildGridBusinessCustomerPayload(input: {
  platformCustomerId: string
  profile: GridBusinessProfile
}): Record<string, unknown> {
  const country = String(input.profile.country ?? "")
    .trim()
    .toUpperCase()
  const legalName = String(input.profile.legalName ?? "").trim()
  const line1 = String(input.profile.addressLine1 ?? "").trim()
  const city = String(input.profile.city ?? "").trim()

  const payload: Record<string, unknown> = {
    customerType: "BUSINESS",
    platformCustomerId: input.platformCustomerId,
    region: country || undefined,
    email: input.profile.email?.trim() || undefined,
    businessInfo: {
      legalName,
      registrationNumber: input.profile.registrationNumber?.trim() || undefined,
      taxId: input.profile.taxId?.trim() || undefined,
      country: country || undefined,
    },
  }

  if (line1 || city || country) {
    payload.address = {
      line1: line1 || city || country,
      city: city || undefined,
      state: input.profile.state?.trim() || undefined,
      postalCode: input.profile.postalCode?.trim() || "00000",
      country: country || undefined,
    }
  }

  return payload
}
