import { normalizeCountryIso, countryDisplayName } from "@easner/shared/verified-identity"

export type ParsedGridCustomerForBusiness = {
  name?: string
  registration_number?: string | null
  tax_id?: string | null
  country?: string | null
  address_line1?: string | null
  city?: string | null
  state?: string | null
  postal_code?: string | null
  kyb_verified_at?: string
}

function readObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null
}

function pickString(obj: Record<string, unknown> | null, ...keys: string[]): string | null {
  if (!obj) return null
  for (const key of keys) {
    const v = obj[key]
    if (typeof v === "string" && v.trim()) return v.trim()
  }
  return null
}

/** Map approved Grid BUSINESS customer → businesses row (Noah parity: backfill after KYB). */
export function parseGridCustomerForBusiness(
  customer: Record<string, unknown>,
  opts?: { occurredAt?: string },
): ParsedGridCustomerForBusiness {
  const businessInfo = readObject(customer.businessInfo)
  const address = readObject(customer.address) ?? readObject(businessInfo?.address)

  const legalName = pickString(businessInfo, "legalName", "legal_name") ?? pickString(customer, "legalName", "name")
  const countryIso =
    normalizeCountryIso(businessInfo?.country) ??
    normalizeCountryIso(address?.country) ??
    normalizeCountryIso(customer.region)

  const out: ParsedGridCustomerForBusiness = {}
  if (legalName) out.name = legalName

  const registration = pickString(businessInfo, "registrationNumber", "registration_number")
  if (registration) out.registration_number = registration

  const taxId = pickString(businessInfo, "taxId", "tax_id")
  if (taxId) out.tax_id = taxId

  if (countryIso) out.country = countryDisplayName(countryIso) || countryIso

  const line1 = pickString(address, "line1", "line_1", "street")
  if (line1) out.address_line1 = line1

  const city = pickString(address, "city")
  if (city) out.city = city

  const state = pickString(address, "state", "region")
  if (state) out.state = state

  const postal = pickString(address, "postalCode", "postal_code", "zip")
  if (postal) out.postal_code = postal

  const status = String(customer.kybStatus ?? customer.kycStatus ?? "").toUpperCase()
  if (status === "APPROVED") {
    out.kyb_verified_at = opts?.occurredAt ?? new Date().toISOString()
  }

  return out
}
