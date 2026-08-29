export type ExpressDepositsNextStep =
  | "link"
  | "us_kyc"
  | "us_l2"
  | "eu_kyc"
  | "eu_identifiers"
  | "eu_attestation"
  | "eu_l2"
  | "review"
  | "wallet"
  | "payment"
  | "ready"

/** Stripe-hosted ID + selfie. Not the L0/L1 details form. */
export function isExpressIdentitySetupStep(nextStep?: string | null): boolean {
  const raw = String(nextStep || "")
  return raw === "us_l2" || raw === "eu_l2"
}

export function isExpressReviewSetupStep(nextStep?: string | null): boolean {
  return String(nextStep || "") === "review"
}

export type ExpressDepositsKycTier = {
  tier?: string | null
  verification_status?: string | null
}

export type ExpressDepositsVerification = {
  name?: string | null
  type?: string | null
  status?: string | null
}

export type ExpressDepositsCustomerSnapshot = {
  id?: string | null
  kyc_region?: string | null
  kyc_tiers?: ExpressDepositsKycTier[] | null
  provided_fields?: string[] | null
  verifications?: ExpressDepositsVerification[] | null
}

function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {}
}

function asStringList(v: unknown): string[] {
  return Array.isArray(v) ? v.map((item) => String(item)) : []
}

/** Retrieve CryptoCustomer may return `kyc_tiers` and/or `verifications` (kyc_verified, id_document_verified). */
export function normalizeExpressDepositsCustomer(raw: unknown): ExpressDepositsCustomerSnapshot | null {
  const row = asRecord(raw)
  const nested = asRecord(row.crypto_customer ?? row.customer ?? row.data)
  const src = typeof nested.id === "string" ? nested : row
  const id = typeof src.id === "string" ? src.id : null
  if (!id) return null
  const tiersRaw = src.kyc_tiers ?? src.kycTiers
  const verificationsRaw = src.verifications
  const providedRaw = src.provided_fields ?? src.providedFields
  const region = src.kyc_region ?? src.kycRegion
  return {
    id,
    kyc_region: typeof region === "string" ? region : null,
    kyc_tiers: Array.isArray(tiersRaw)
      ? tiersRaw.map((tier) => {
          const t = asRecord(tier)
          return {
            tier: typeof t.tier === "string" ? t.tier : null,
            verification_status:
              typeof t.verification_status === "string"
                ? t.verification_status
                : typeof t.verificationStatus === "string"
                  ? t.verificationStatus
                  : null,
          }
        })
      : [],
    provided_fields: asStringList(providedRaw),
    verifications: Array.isArray(verificationsRaw)
      ? verificationsRaw.map((item) => {
          const v = asRecord(item)
          return {
            name: typeof v.name === "string" ? v.name : typeof v.type === "string" ? v.type : null,
            status: typeof v.status === "string" ? v.status : null,
          }
        })
      : [],
  }
}

function isVerifiedStatus(status: string): boolean {
  return status === "verified" || status === "approved" || status === "success"
}

function isPendingStatus(status: string): boolean {
  return status === "pending" || status === "in_review" || status === "processing" || status === "under_review"
}

function isRejectedStatus(status: string): boolean {
  return status === "rejected" || status === "failed" || status === "canceled" || status === "cancelled"
}

function tierStatus(customer: ExpressDepositsCustomerSnapshot, tier: string): string {
  const row = (customer.kyc_tiers ?? []).find((t) => String(t.tier || "").toLowerCase() === tier)
  return String(row?.verification_status || "").toLowerCase()
}

function provided(customer: ExpressDepositsCustomerSnapshot, field: string): boolean {
  return (customer.provided_fields ?? []).map((f) => String(f).toLowerCase()).includes(field)
}

function hasNameAndAddress(customer: ExpressDepositsCustomerSnapshot): boolean {
  const hasName =
    (provided(customer, "first_name") || provided(customer, "given_name")) &&
    (provided(customer, "last_name") || provided(customer, "surname"))
  return hasName && provided(customer, "address_line_1")
}

function hasUsL1Fields(customer: ExpressDepositsCustomerSnapshot): boolean {
  return (
    (provided(customer, "dob") || provided(customer, "date_of_birth")) &&
    (provided(customer, "id_number") || provided(customer, "id_type"))
  )
}

export function expressDepositsHighestVerifiedTier(
  customer: ExpressDepositsCustomerSnapshot | null | undefined,
): "l0" | "l1" | "l2" | null {
  if (!customer) return null
  if (isVerifiedStatus(tierStatus(customer, "l2"))) return "l2"
  if (isVerifiedStatus(tierStatus(customer, "l1"))) return "l1"
  if (isVerifiedStatus(tierStatus(customer, "l0"))) return "l0"
  return null
}

export function expressDepositsPersistStatus(nextStep: ExpressDepositsNextStep): string {
  if (nextStep === "ready") return "ready"
  if (nextStep === "review") return "in_review"
  if (nextStep === "link") return "not_started"
  return "in_progress"
}

function hasIdentifier(customer: ExpressDepositsCustomerSnapshot): boolean {
  return provided(customer, "identifiers") || provided(customer, "id_number") || provided(customer, "id_type")
}

function hasAttestation(customer: ExpressDepositsCustomerSnapshot): boolean {
  return provided(customer, "attestation")
}

/**
 * US: one setup should finish L0 + L1 (details + SSN) then L2 (ID + selfie).
 * Drive off `kyc_tiers`. Do not treat deprecated `id_document_verified` as L2 —
 * Stripe can mark that while `kyc_tiers.l2` is still `not_started`.
 */
export function expressDepositsNextStep(input: {
  cryptoCustomerId?: string | null
  customer?: ExpressDepositsCustomerSnapshot | null
  payerCountry?: string | null
  walletRegistered?: boolean
}): ExpressDepositsNextStep {
  if (!input.cryptoCustomerId && !input.customer?.id) return "link"

  const customer = input.customer ?? {}
  const region = String(customer.kyc_region || "").toLowerCase()
  const country = String(input.payerCountry || "").toUpperCase()
  const isEu = region === "eu" || (!region && country !== "US" && country !== "")

  const l0 = tierStatus(customer, "l0")
  const l1 = tierStatus(customer, "l1")
  const l2 = tierStatus(customer, "l2")
  const l0Verified = isVerifiedStatus(l0)
  const l1Verified = isVerifiedStatus(l1)
  const l2Verified = isVerifiedStatus(l2)

  if (l2Verified) {
    if (!input.walletRegistered) return "wallet"
    return "ready"
  }

  if (isEu) {
    if (isPendingStatus(l0) || isPendingStatus(l1)) return "review"
    if (!l0Verified && !l1Verified && !hasNameAndAddress(customer)) return "eu_kyc"
    if (!hasIdentifier(customer)) return "eu_identifiers"
    if (!hasAttestation(customer)) return "eu_attestation"
    if (isPendingStatus(l2)) return "review"
    if (!l2Verified) return "eu_l2"
  } else {
    if (isPendingStatus(l0) || isPendingStatus(l1)) return "review"
    if (!l1Verified) {
      if (hasUsL1Fields(customer) && !isRejectedStatus(l1)) return "review"
      return "us_kyc"
    }
    if (isPendingStatus(l2)) return "review"
    if (!l2Verified) return "us_l2"
  }

  if (!input.walletRegistered) return "wallet"
  return "ready"
}

export function expressDepositsKycReady(customer: ExpressDepositsCustomerSnapshot | null | undefined): boolean {
  if (!customer) return false
  return (
    expressDepositsNextStep({
      cryptoCustomerId: customer.id,
      customer,
      walletRegistered: true,
    }) === "ready"
  )
}
