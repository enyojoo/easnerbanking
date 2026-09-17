import {
  VERIFICATION_STATUS_COPY,
  isBridgeNewYorkResidence,
  isBridgeOnboardableResidence,
  verificationStatusLabel,
} from "@easner/shared"

export function officeVerificationBadgeVariant(
  rawStatus: string | null | undefined,
): "emerald" | "amber" | "oxblood" | "slate" {
  const label = verificationStatusLabel(rawStatus || null, { detail: true })
  if (label === VERIFICATION_STATUS_COPY.verified) return "emerald"
  if (label === VERIFICATION_STATUS_COPY.inReview) return "slate"
  if (
    label === VERIFICATION_STATUS_COPY.actionNeeded ||
    label === VERIFICATION_STATUS_COPY.rejected
  ) {
    return "oxblood"
  }
  return "amber"
}

export function officeStatusIsApproved(raw: string | null | undefined): boolean {
  return verificationStatusLabel(raw || null) === VERIFICATION_STATUS_COPY.verified
}

export function isOrgLinkedUser(user: {
  role?: string | null
  easner_business_id?: string | null
}): boolean {
  return String(user.role || "").toLowerCase() === "business" || Boolean(user.easner_business_id)
}

export function displayText(value: string | null | undefined): string {
  const t = value?.trim()
  return t ? t : "–"
}

export function officeProviderLabel(provider: string | null | undefined): string {
  const raw = String(provider || "").trim().toLowerCase()
  if (!raw) return "–"
  if (raw === "easner_internal") return "Easetag"
  if (raw === "yellowcard") return "Yellowcard"
  if (raw === "bridge") return "Bridge"
  if (raw === "grid") return "Grid"
  if (raw === "noah") return "Noah"
  if (raw === "turnkey") return "Turnkey"
  if (raw === "stripe") return "Stripe"
  if (raw === "relay") return "Relay"
  return raw
}

export function consumerBankKycRail(user: {
  kyc_address_country?: string | null
  residence_country?: string | null
  kyc_address_state?: string | null
}): "bridge" | "noah" {
  const geo = {
    countryCode: user.kyc_address_country || user.residence_country,
    state: user.kyc_address_state,
  }
  if (isBridgeOnboardableResidence(geo) && !isBridgeNewYorkResidence(geo)) return "bridge"
  return "noah"
}
