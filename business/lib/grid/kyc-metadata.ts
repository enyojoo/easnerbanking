import {
  buildNgYcIdPair,
  ngLocalVerificationComplete,
  normalizeYcMomoPhone,
  type NgLocalVerificationProfile,
} from "@easner/shared"

export type GridPersonProfile = NgLocalVerificationProfile & {
  fullName?: string | null
  phone?: string | null
  email?: string | null
  dateOfBirth?: string | null
  addressStreet?: string | null
  addressCity?: string | null
  addressCountry?: string | null
  addressPostalCode?: string | null
  addressState?: string | null
}

/** Build Grid INDIVIDUAL customer payload from Noah-approved profile (BYO KYC). */
export function buildGridIndividualCustomerPayload(input: {
  platformCustomerId: string
  profile: GridPersonProfile
}): Record<string, unknown> {
  const residence = String(input.profile.residenceCountry ?? "")
    .trim()
    .toUpperCase()
  const fullName = String(input.profile.fullName ?? "").trim()
  const [firstName, ...rest] = fullName.split(/\s+/).filter(Boolean)
  const lastName = rest.join(" ") || firstName

  const payload: Record<string, unknown> = {
    customerType: "INDIVIDUAL",
    platformCustomerId: input.platformCustomerId,
    fullName: fullName || undefined,
    firstName: firstName || undefined,
    lastName: lastName || undefined,
    birthDate: input.profile.dateOfBirth?.trim() || undefined,
    nationality: residence || undefined,
    email: input.profile.email?.trim() || undefined,
    phoneNumber: input.profile.phone?.trim()
      ? normalizeYcMomoPhone(input.profile.phone, residence)
      : undefined,
  }

  const line1 = String(input.profile.addressStreet ?? "").trim()
  const city = String(input.profile.addressCity ?? "").trim()
  const country = String(input.profile.addressCountry ?? residence).trim().toUpperCase()
  if (line1 || city || country) {
    payload.address = {
      line1: line1 || city || country,
      city: city || undefined,
      state: input.profile.addressState?.trim() || undefined,
      postalCode: input.profile.addressPostalCode?.trim() || "00000",
      country: country || residence,
    }
  }

  if (residence === "NG") {
    const pair = buildNgYcIdPair(input.profile)
    if (pair) {
      payload.taxIdentification = {
        type: pair.idType,
        value: pair.idNumber,
      }
      if (pair.additionalIdType && pair.additionalIdNumber) {
        payload.additionalTaxIdentification = {
          type: pair.additionalIdType,
          value: pair.additionalIdNumber,
        }
      }
    }
  } else if (input.profile.kycIdType && input.profile.kycIdNumber) {
    payload.taxIdentification = {
      type: String(input.profile.kycIdType),
      value: String(input.profile.kycIdNumber),
    }
  }

  return payload
}

export function assertGridNgKycReady(profile: NgLocalVerificationProfile): void {
  const residence = String(profile.residenceCountry ?? "")
    .trim()
    .toUpperCase()
  if (residence !== "NG") return
  if (!ngLocalVerificationComplete(profile)) {
    throw new Error("ng_local_verification_incomplete")
  }
}
