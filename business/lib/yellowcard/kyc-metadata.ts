import {
  buildNgYcIdPair,
  ngLocalVerificationComplete,
  normalizeYcMomoPhone,
  type NgLocalVerificationProfile,
} from "@easner/shared"

export type YcPersonMetadata = {
  name?: string
  country?: string
  phone?: string
  email?: string
  address?: string
  idType?: string
  idNumber?: string
  additionalIdType?: string
  additionalIdNumber?: string
  dob?: string
  [key: string]: unknown
}

/**
 * Build YC sender/recipient KYC metadata.
 * NG: requires NIN+BVN (Noah + supplement). Business NG → owner as retail person.
 */
export function buildYcKycPersonMetadata(input: {
  profile: NgLocalVerificationProfile & {
    fullName?: string | null
    phone?: string | null
    email?: string | null
    dateOfBirth?: string | null
    addressStreet?: string | null
    addressCity?: string | null
    addressCountry?: string | null
  }
  /** When true, reject if NG IDs incomplete */
  requireNgIds?: boolean
}): YcPersonMetadata {
  const residence = String(input.profile.residenceCountry ?? "")
    .trim()
    .toUpperCase()
  const meta: YcPersonMetadata = {
    name: input.profile.fullName?.trim() || undefined,
    country: residence || undefined,
    phone: input.profile.phone?.trim()
      ? normalizeYcMomoPhone(input.profile.phone, residence)
      : undefined,
    email: input.profile.email?.trim() || undefined,
    dob: input.profile.dateOfBirth?.trim() || undefined,
  }

  const parts = [input.profile.addressStreet, input.profile.addressCity, input.profile.addressCountry]
    .map((p) => String(p ?? "").trim())
    .filter(Boolean)
  if (parts.length) meta.address = parts.join(", ")

  if (residence === "NG") {
    const pair = buildNgYcIdPair(input.profile)
    if (!pair) {
      if (input.requireNgIds !== false) {
        throw new Error("ng_local_verification_incomplete")
      }
    } else {
      meta.idType = pair.idType
      meta.idNumber = pair.idNumber
      meta.additionalIdType = pair.additionalIdType
      meta.additionalIdNumber = pair.additionalIdNumber
    }
  } else if (input.profile.kycIdType && input.profile.kycIdNumber) {
    meta.idType = String(input.profile.kycIdType)
    meta.idNumber = String(input.profile.kycIdNumber)
  }

  return meta
}

export function assertNgYcReady(profile: NgLocalVerificationProfile): void {
  const residence = String(profile.residenceCountry ?? "")
    .trim()
    .toUpperCase()
  if (residence !== "NG") return
  if (!ngLocalVerificationComplete(profile)) {
    throw new Error("ng_local_verification_incomplete")
  }
}
