import { isStripeOnrampEuCountry } from "./stripe-onramp-geo"

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

export function expressDepositsStatusIsReady(data?: {
  ready?: boolean
  status?: string | null
} | null): boolean {
  if (!data) return false
  if (data.ready === true) return true
  const s = String(data.status || "").toLowerCase()
  return s === "ready" || s === "approved"
}

/** Don't flash "set up" after a verified cache when a live retrieve comes back empty. */
export function keepExpressDepositsCachedReady(input: {
  cachedReady: boolean
  incoming: {
    ready?: boolean
    status?: string | null
    eligible?: boolean
    kycTiers?: unknown[] | null
    cryptoCustomerId?: string | null
  }
}): boolean {
  if (input.incoming.eligible === false) return false
  if (expressDepositsStatusIsReady(input.incoming)) return true
  if (!input.cachedReady) return false
  const tiers = input.incoming.kycTiers
  return Boolean(input.incoming.cryptoCustomerId) && Array.isArray(tiers) && tiers.length === 0
}

const EXPRESS_SETUP_STEP_RANK: Record<ExpressDepositsNextStep, number> = {
  link: 0,
  us_kyc: 1,
  eu_kyc: 1,
  eu_identifiers: 2,
  eu_attestation: 3,
  review: 4,
  us_l2: 5,
  eu_l2: 5,
  payment: 6,
  wallet: 6,
  ready: 7,
}

/** Resume the right setup screen from cache when nextStep was not stored. */
export function resolveExpressDepositsSetupStep(input?: {
  nextStep?: ExpressDepositsNextStep | null
  ready?: boolean
  status?: string | null
  cryptoCustomerId?: string | null
  payerCountry?: string | null
} | null): ExpressDepositsNextStep {
  if (!input) return "link"
  if (input.nextStep) return input.nextStep
  if (expressDepositsStatusIsReady(input)) return "ready"
  if (input.cryptoCustomerId) {
    return expressDepositsUsesEuKyc({ payerCountry: input.payerCountry }) ? "eu_kyc" : "us_kyc"
  }
  return "link"
}

/** Instant UI advance after a setup step succeeds; live status may refine it. */
export function expressDepositsAdvanceAfter(input: {
  completed: ExpressDepositsNextStep
  payerCountry?: string | null
}): ExpressDepositsNextStep {
  const eu = expressDepositsUsesEuKyc({ payerCountry: input.payerCountry })
  switch (input.completed) {
    case "link":
      return eu ? "eu_kyc" : "us_kyc"
    case "us_kyc":
      return "review"
    case "eu_kyc":
      return "eu_identifiers"
    case "eu_identifiers":
      return "eu_attestation"
    case "eu_attestation":
      return "eu_l2"
    case "us_l2":
    case "eu_l2":
      return "review"
    case "review":
      return "wallet"
    case "wallet":
    case "payment":
      return "ready"
    default:
      return input.completed
  }
}

/** Don't flash back to an earlier step when a live retrieve comes back empty. */
export function keepExpressDepositsCachedNextStep(input: {
  cached?: ExpressDepositsNextStep | null
  incoming?: ExpressDepositsNextStep | null
  incomingKycTiers?: unknown[] | null
  incomingEligible?: boolean
}): ExpressDepositsNextStep | null {
  if (input.incomingEligible === false) return input.incoming ?? null
  const cached = input.cached ?? null
  const incoming = input.incoming ?? null
  if (!cached) return incoming
  if (!incoming) return cached
  if (cached === incoming) return incoming
  if (
    cached === "review" &&
    incoming === "eu_l2" &&
    isPendingStatus(incomingTierStatus(input.incomingKycTiers, "l2"))
  ) {
    return cached
  }
  const emptyTiers = !Array.isArray(input.incomingKycTiers) || input.incomingKycTiers.length === 0
  if (emptyTiers && EXPRESS_SETUP_STEP_RANK[cached] > EXPRESS_SETUP_STEP_RANK[incoming]) {
    return cached
  }
  return incoming
}

function expressDepositsUsesEuKyc(input: {
  kycRegion?: string | null
  payerCountry?: string | null
}): boolean {
  const region = String(input.kycRegion || "").toLowerCase()
  if (region === "eu") return true
  if (region === "us") return false
  return isStripeOnrampEuCountry(input.payerCountry)
}

function incomingTierStatus(tiers: unknown[] | null | undefined, tier: string): string {
  if (!Array.isArray(tiers)) return ""
  const row = tiers.find((item) => String(asRecord(item).tier || "").toLowerCase() === tier)
  const rec = asRecord(row)
  return String(rec.verification_status ?? rec.verificationStatus ?? "").toLowerCase()
}

function hasEuIdentifiers(customer: ExpressDepositsCustomerSnapshot): boolean {
  return provided(customer, "identifiers")
}

function hasAttestation(customer: ExpressDepositsCustomerSnapshot): boolean {
  return provided(customer, "attestation")
}

/**
 * US: one setup should finish L0 + L1 (details + SSN) then L2 (ID + selfie).
 * EU: name/address/birth → MiCA identifiers → attestation → L2. Stripe marks
 * EU L0/L1 `not_available` and L2 `pending` after basic KYC — that is not review.
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
  const isEu = expressDepositsUsesEuKyc({
    kycRegion: customer.kyc_region,
    payerCountry: input.payerCountry,
  })

  const l0 = tierStatus(customer, "l0")
  const l1 = tierStatus(customer, "l1")
  const l2 = tierStatus(customer, "l2")
  const l1Verified = isVerifiedStatus(l1)
  const l2Verified = isVerifiedStatus(l2)

  if (isEu) {
    if (!l2Verified && !isPendingStatus(l2) && !isRejectedStatus(l2) && !hasNameAndAddress(customer)) {
      return "eu_kyc"
    }
    if (!hasEuIdentifiers(customer)) return "eu_identifiers"
    if (!hasAttestation(customer)) return "eu_attestation"
    if (l2Verified) {
      if (!input.walletRegistered) return "wallet"
      return "ready"
    }
    return "eu_l2"
  }

  if (l2Verified) {
    if (!input.walletRegistered) return "wallet"
    return "ready"
  }

  if (isPendingStatus(l0) || isPendingStatus(l1)) return "review"
  if (!l1Verified) {
    if (hasUsL1Fields(customer) && !isRejectedStatus(l1)) return "review"
    return "us_kyc"
  }
  if (isPendingStatus(l2)) return "review"
  if (!l2Verified) return "us_l2"

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
