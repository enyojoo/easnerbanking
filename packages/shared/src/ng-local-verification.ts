/**
 * Nigeria local verification supplement for Yellowcard rails.
 * Noah stores one ID (NIN or BVN); YC requires both.
 *
 * Supplement storage on `users.ng_local_id_*`:
 * - Single missing ID → `ng_local_id_type` = NIN|BVN, number = 11 digits
 * - Both missing → `ng_local_id_type` = PAIR, number = `nin|bvn`
 */

export type NgLocalIdType = "NIN" | "BVN"

/** Stored in `ng_local_id_type` when both NIN and BVN were collected together. */
export const NG_LOCAL_ID_PAIR = "PAIR" as const

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
  supplementType: NgLocalIdType | typeof NG_LOCAL_ID_PAIR | null
  supplementNumber: string | null
  hasNin: boolean
  hasBvn: boolean
  complete: boolean
  /** All IDs still needed (empty when complete). Prefer this for forms. */
  missingTypes: NgLocalIdType[]
  /** First missing ID, or null when complete – gating / legacy. */
  missingType: NgLocalIdType | null
}

/** Map Noah/Grid `kyc_id_type` → YC NIN/BVN. */
export function mapNoahKycIdTypeToNgLocal(raw: string | null | undefined): NgLocalIdType | null {
  const t = String(raw ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_")
  if (!t) return null
  // Noah TaxID / Grid NON_US_TAX_ID → "Tax ID" / tax_id – BVN for NG persons
  if (
    t === "taxid" ||
    t === "tax_id" ||
    t === "non_us_tax_id" ||
    t === "bvn"
  ) {
    return "BVN"
  }
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

export function isNgLocalIdPairType(raw: string | null | undefined): boolean {
  return String(raw ?? "").trim().toUpperCase() === NG_LOCAL_ID_PAIR
}

/** NIN and BVN are 11 digits in Nigeria. */
export function isValidNgLocalIdNumber(value: string | null | undefined): boolean {
  return /^\d{11}$/.test(String(value ?? "").trim())
}

/** Encode NIN + BVN into the supplement number column. */
export function encodeNgLocalIdPair(nin: string, bvn: string): string {
  return `${String(nin).trim()}|${String(bvn).trim()}`
}

/** Parse supplement PAIR storage (`nin|bvn`). */
export function parseNgLocalIdPair(
  number: string | null | undefined,
): { nin: string; bvn: string } | null {
  const raw = String(number ?? "").trim()
  const [nin, bvn] = raw.split("|")
  if (!isValidNgLocalIdNumber(nin) || !isValidNgLocalIdNumber(bvn)) return null
  return { nin: nin.trim(), bvn: bvn.trim() }
}

export function resolveNgLocalVerification(
  profile: NgLocalVerificationProfile,
): NgLocalVerificationState {
  const noahMappedType = mapNoahKycIdTypeToNgLocal(profile.kycIdType)
  const noahIdNumber = String(profile.kycIdNumber ?? "").trim() || null
  const noahNumberOk = Boolean(noahMappedType && noahIdNumber && isValidNgLocalIdNumber(noahIdNumber))

  const rawSupplementType = String(profile.ngLocalIdType ?? "").trim().toUpperCase()
  const supplementNumber = String(profile.ngLocalIdNumber ?? "").trim() || null
  const isPair = rawSupplementType === NG_LOCAL_ID_PAIR
  const pair = isPair ? parseNgLocalIdPair(supplementNumber) : null
  const supplementType = isPair
    ? pair
      ? NG_LOCAL_ID_PAIR
      : null
    : normalizeNgLocalIdType(profile.ngLocalIdType)
  const supplementOk = Boolean(
    isPair
      ? pair
      : supplementType && supplementNumber && isValidNgLocalIdNumber(supplementNumber),
  )

  let hasNin = false
  let hasBvn = false
  if (noahNumberOk && noahMappedType === "NIN") hasNin = true
  if (noahNumberOk && noahMappedType === "BVN") hasBvn = true
  if (pair) {
    hasNin = true
    hasBvn = true
  } else if (supplementOk && supplementType === "NIN") {
    hasNin = true
  } else if (supplementOk && supplementType === "BVN") {
    hasBvn = true
  }

  const missingTypes: NgLocalIdType[] = []
  if (!hasNin) missingTypes.push("NIN")
  if (!hasBvn) missingTypes.push("BVN")
  const complete = missingTypes.length === 0
  const missingType = missingTypes[0] ?? null

  return {
    noahMappedType,
    noahIdNumber: noahNumberOk ? noahIdNumber : null,
    supplementType: supplementOk ? supplementType : null,
    supplementNumber: supplementOk ? supplementNumber : null,
    hasNin,
    hasBvn,
    complete,
    missingTypes,
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
  introOne: "Our local payment partner needs one more ID for NGN deposits and local payments.",
  inlinePromptNin: "Before you use NGN deposits, add your NIN. ",
  inlinePromptBvn: "Before you use NGN deposits, add your BVN. ",
  inlinePromptBoth: "Before you use NGN deposits, add your NIN and BVN. ",
  inlineLink: "Complete local verification →",
  gateBlocked: "Complete Nigeria local verification to use this payment method.",
  fieldLabelNin: "NIN (11 digits)",
  fieldLabelBvn: "BVN (11 digits)",
  save: "Save",
  verified: "You’re verified for local NGN payments.",
} as const

export function ngSupplementInlinePrompt(
  missing: NgLocalIdType | NgLocalIdType[] | null | undefined,
): string {
  const types = Array.isArray(missing)
    ? missing
    : missing
      ? [missing]
      : []
  if (types.length >= 2) return NG_LOCAL_VERIFICATION_COPY.inlinePromptBoth
  if (types[0] === "NIN") return NG_LOCAL_VERIFICATION_COPY.inlinePromptNin
  if (types[0] === "BVN") return NG_LOCAL_VERIFICATION_COPY.inlinePromptBvn
  return NG_LOCAL_VERIFICATION_COPY.inlinePromptBoth
}

/**
 * Build YC Nigeria KYC id pair from Noah + supplement.
 * Primary = Noah ID when present; otherwise NIN then BVN from supplement.
 */
export function buildNgYcIdPair(profile: NgLocalVerificationProfile): {
  idType: NgLocalIdType
  idNumber: string
  additionalIdType: NgLocalIdType
  additionalIdNumber: string
} | null {
  const state = resolveNgLocalVerification(profile)
  if (!state.complete) return null

  let nin: string | null = null
  let bvn: string | null = null

  if (state.noahMappedType === "NIN" && state.noahIdNumber) nin = state.noahIdNumber
  if (state.noahMappedType === "BVN" && state.noahIdNumber) bvn = state.noahIdNumber

  if (state.supplementType === NG_LOCAL_ID_PAIR && state.supplementNumber) {
    const pair = parseNgLocalIdPair(state.supplementNumber)
    if (pair) {
      nin = nin || pair.nin
      bvn = bvn || pair.bvn
    }
  } else if (state.supplementType === "NIN" && state.supplementNumber) {
    nin = nin || state.supplementNumber
  } else if (state.supplementType === "BVN" && state.supplementNumber) {
    bvn = bvn || state.supplementNumber
  }

  if (!nin || !bvn) return null

  if (state.noahMappedType === "NIN") {
    return { idType: "NIN", idNumber: nin, additionalIdType: "BVN", additionalIdNumber: bvn }
  }
  if (state.noahMappedType === "BVN") {
    return { idType: "BVN", idNumber: bvn, additionalIdType: "NIN", additionalIdNumber: nin }
  }
  return { idType: "NIN", idNumber: nin, additionalIdType: "BVN", additionalIdNumber: bvn }
}
