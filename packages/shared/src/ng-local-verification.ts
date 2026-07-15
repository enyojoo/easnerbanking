/**
 * Nigeria local verification supplement for Yellowcard rails.
 * Noah stores one ID (NIN or BVN); YC requires both.
 */

export type NgLocalIdType = "NIN" | "BVN"

export type NgLocalVerificationProfile = {
  residenceCountry?: string | null
  /** Noah-synced: TaxID → BVN, NationalID / NationalIDCard → NIN */
  kycIdType?: string | null
  kycIdNumber?: string | null
  /** Easner supplement columns on users */
  ngLocalIdType?: string | null
  ngLocalIdNumber?: string | null
}

export type NgLocalVerificationState = {
  noahMappedType: NgLocalIdType | null
  noahIdNumber: string | null
  supplementType: NgLocalIdType | null
  supplementNumber: string | null
  hasNin: boolean
  hasBvn: boolean
  complete: boolean
  /** Single missing ID the user must provide, if any */
  missingType: NgLocalIdType | null
}

/** Map Noah `kyc_id_type` → YC NIN/BVN. */
export function mapNoahKycIdTypeToNgLocal(raw: string | null | undefined): NgLocalIdType | null {
  const t = String(raw ?? "")
    .trim()
    .toLowerCase()
  if (!t) return null
  if (t === "taxid" || t === "tax_id" || t === "bvn") return "BVN"
  if (
    t === "nationalid" ||
    t === "national_id" ||
    t === "nationalidcard" ||
    t === "national_id_card" ||
    t === "nin"
  ) {
    return "NIN"
  }
  return null
}

export function normalizeNgLocalIdType(raw: string | null | undefined): NgLocalIdType | null {
  const t = String(raw ?? "")
    .trim()
    .toUpperCase()
  if (t === "NIN" || t === "BVN") return t
  return mapNoahKycIdTypeToNgLocal(raw)
}

/** NIN and BVN are 11 digits in Nigeria. */
export function isValidNgLocalIdNumber(value: string | null | undefined): boolean {
  return /^\d{11}$/.test(String(value ?? "").trim())
}

export function resolveNgLocalVerification(
  profile: NgLocalVerificationProfile,
): NgLocalVerificationState {
  const noahMappedType = mapNoahKycIdTypeToNgLocal(profile.kycIdType)
  const noahIdNumber = String(profile.kycIdNumber ?? "").trim() || null
  const noahNumberOk = Boolean(noahMappedType && noahIdNumber && isValidNgLocalIdNumber(noahIdNumber))

  const supplementType = normalizeNgLocalIdType(profile.ngLocalIdType)
  const supplementNumber = String(profile.ngLocalIdNumber ?? "").trim() || null
  const supplementOk = Boolean(
    supplementType && supplementNumber && isValidNgLocalIdNumber(supplementNumber),
  )

  let hasNin = false
  let hasBvn = false
  if (noahNumberOk && noahMappedType === "NIN") hasNin = true
  if (noahNumberOk && noahMappedType === "BVN") hasBvn = true
  if (supplementOk && supplementType === "NIN") hasNin = true
  if (supplementOk && supplementType === "BVN") hasBvn = true

  const complete = hasNin && hasBvn
  const missingType: NgLocalIdType | null = complete
    ? null
    : !hasNin
      ? "NIN"
      : !hasBvn
        ? "BVN"
        : null

  return {
    noahMappedType,
    noahIdNumber: noahNumberOk ? noahIdNumber : null,
    supplementType: supplementOk ? supplementType : null,
    supplementNumber: supplementOk ? supplementNumber : null,
    hasNin,
    hasBvn,
    complete,
    missingType,
  }
}

export function ngLocalVerificationComplete(profile: NgLocalVerificationProfile): boolean {
  return resolveNgLocalVerification(profile).complete
}

/**
 * Whether office offers any YC local rails for NG (receive and/or payout).
 * Callers pass precomputed office flags.
 */
export function ycLocalRailsOfferedForNg(input: {
  ycReceiveEnabledForNg?: boolean
  hasYellowcardPayoutCorridorForNg?: boolean
}): boolean {
  return Boolean(input.ycReceiveEnabledForNg || input.hasYellowcardPayoutCorridorForNg)
}

export function showNgSupplementPrompt(
  profile: NgLocalVerificationProfile,
  office: {
    ycReceiveEnabledForNg?: boolean
    hasYellowcardPayoutCorridorForNg?: boolean
  },
): boolean {
  const residence = String(profile.residenceCountry ?? "")
    .trim()
    .toUpperCase()
  if (residence !== "NG") return false
  if (!ycLocalRailsOfferedForNg(office)) return false
  return !ngLocalVerificationComplete(profile)
}

export const NG_LOCAL_VERIFICATION_COPY = {
  title: "Nigeria local verification",
  introBoth:
    "Our local payment partner requires both NIN and BVN for NGN deposits and local payments.",
  inlinePromptNin: "Before you use NGN deposits, add your NIN. ",
  inlinePromptBvn: "Before you use NGN deposits, add your BVN. ",
  inlineLink: "Complete local verification →",
  gateBlocked: "Complete Nigeria local verification to use this payment method.",
  fieldLabelNin: "NIN (11 digits)",
  fieldLabelBvn: "BVN (11 digits)",
  save: "Save",
  verified: "You’re verified for local NGN payments.",
} as const

export function ngSupplementInlinePrompt(missingType: NgLocalIdType): string {
  return missingType === "NIN"
    ? NG_LOCAL_VERIFICATION_COPY.inlinePromptNin
    : NG_LOCAL_VERIFICATION_COPY.inlinePromptBvn
}

/**
 * Build YC Nigeria KYC id pair from Noah + supplement.
 * Primary = Noah ID; additional = the other.
 */
export function buildNgYcIdPair(profile: NgLocalVerificationProfile): {
  idType: NgLocalIdType
  idNumber: string
  additionalIdType: NgLocalIdType
  additionalIdNumber: string
} | null {
  const state = resolveNgLocalVerification(profile)
  if (!state.complete) return null

  const nin =
    state.noahMappedType === "NIN" && state.noahIdNumber
      ? state.noahIdNumber
      : state.supplementType === "NIN" && state.supplementNumber
        ? state.supplementNumber
        : null
  const bvn =
    state.noahMappedType === "BVN" && state.noahIdNumber
      ? state.noahIdNumber
      : state.supplementType === "BVN" && state.supplementNumber
        ? state.supplementNumber
        : null
  if (!nin || !bvn) return null

  if (state.noahMappedType === "NIN") {
    return { idType: "NIN", idNumber: nin, additionalIdType: "BVN", additionalIdNumber: bvn }
  }
  if (state.noahMappedType === "BVN") {
    return { idType: "BVN", idNumber: bvn, additionalIdType: "NIN", additionalIdNumber: nin }
  }
  // Supplement-only both (unlikely): prefer NIN primary
  return { idType: "NIN", idNumber: nin, additionalIdType: "BVN", additionalIdNumber: bvn }
}
