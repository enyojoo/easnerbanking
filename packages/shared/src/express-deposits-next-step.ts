export type ExpressDepositsNextStep =
  | "link"
  | "us_kyc"
  | "us_l2"
  | "eu_kyc"
  | "eu_identifiers"
  | "eu_attestation"
  | "eu_l2"
  | "wallet"
  | "payment"
  | "ready"

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

function tierStatus(customer: ExpressDepositsCustomerSnapshot, tier: string): string {
  const row = (customer.kyc_tiers ?? []).find((t) => String(t.tier || "").toLowerCase() === tier)
  return String(row?.verification_status || "").toLowerCase()
}

function verificationStatus(customer: ExpressDepositsCustomerSnapshot, name: string): string {
  const row = (customer.verifications ?? []).find(
    (v) => String(v.name || v.type || "").toLowerCase() === name,
  )
  return String(row?.status || "").toLowerCase()
}

function provided(customer: ExpressDepositsCustomerSnapshot, field: string): boolean {
  return (customer.provided_fields ?? []).map((f) => String(f).toLowerCase()).includes(field)
}

function inFlightOrDone(status: string): boolean {
  return Boolean(status) && status !== "not_started" && status !== "not_available"
}

function hasSubmittedIdentityFields(customer: ExpressDepositsCustomerSnapshot): boolean {
  const hasName =
    (provided(customer, "first_name") || provided(customer, "given_name")) &&
    (provided(customer, "last_name") || provided(customer, "surname"))
  return (
    hasName &&
    (provided(customer, "address_line_1") ||
      provided(customer, "dob") ||
      provided(customer, "date_of_birth"))
  )
}

function identityVerified(customer: ExpressDepositsCustomerSnapshot): boolean {
  if (
    isVerifiedStatus(tierStatus(customer, "l1")) ||
    isVerifiedStatus(tierStatus(customer, "l0")) ||
    isVerifiedStatus(verificationStatus(customer, "kyc_verified"))
  ) {
    return true
  }
  if (
    inFlightOrDone(tierStatus(customer, "l2")) ||
    inFlightOrDone(verificationStatus(customer, "id_document_verified"))
  ) {
    return true
  }
  if (hasSubmittedIdentityFields(customer)) return true
  const kyc = verificationStatus(customer, "kyc_verified")
  if (kyc === "not_started" || kyc === "rejected" || kyc === "not_available") return false
  // Link already created the customer; retrieve often omits tiers. Do not collect name/address again.
  return Boolean(customer.id) && !(customer.kyc_tiers?.length) && !(customer.verifications?.length)
}

function documentsVerified(customer: ExpressDepositsCustomerSnapshot): boolean {
  return (
    isVerifiedStatus(tierStatus(customer, "l2")) ||
    isVerifiedStatus(verificationStatus(customer, "id_document_verified"))
  )
}

function hasIdentifier(customer: ExpressDepositsCustomerSnapshot): boolean {
  return provided(customer, "identifiers") || provided(customer, "id_number") || provided(customer, "id_type")
}

function hasAttestation(customer: ExpressDepositsCustomerSnapshot): boolean {
  return provided(customer, "attestation")
}

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

  if (isEu) {
    if (!identityVerified(customer)) return "eu_kyc"
    if (!hasIdentifier(customer)) return "eu_identifiers"
    if (!hasAttestation(customer)) return "eu_attestation"
    if (!documentsVerified(customer)) return "eu_l2"
  } else {
    if (!identityVerified(customer)) return "us_kyc"
    if (!documentsVerified(customer)) return "us_l2"
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
