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

export type ExpressDepositsCustomerSnapshot = {
  id?: string | null
  kyc_region?: string | null
  kyc_tiers?: ExpressDepositsKycTier[] | null
  provided_fields?: string[] | null
}

function tierStatus(customer: ExpressDepositsCustomerSnapshot, tier: string): string {
  const row = (customer.kyc_tiers ?? []).find((t) => String(t.tier || "").toLowerCase() === tier)
  return String(row?.verification_status || "").toLowerCase()
}

function provided(customer: ExpressDepositsCustomerSnapshot, field: string): boolean {
  return (customer.provided_fields ?? []).map((f) => String(f).toLowerCase()).includes(field)
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
    const l2 = tierStatus(customer, "l2")
    if (!region || l2 === "" || l2 === "not_started") return "eu_kyc"
    if (!provided(customer, "identifiers")) return "eu_identifiers"
    if (!provided(customer, "attestation")) return "eu_attestation"
    if (l2 !== "verified") return "eu_l2"
  } else {
    const l0 = tierStatus(customer, "l0")
    const l1 = tierStatus(customer, "l1")
    const l2 = tierStatus(customer, "l2")
    const identityOk = l1 === "verified" || l0 === "verified"
    if (!identityOk) return "us_kyc"
    if (l2 !== "verified") return "us_l2"
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
