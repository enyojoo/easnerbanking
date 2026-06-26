/**
 * Map Noah Business customer payload → `public.businesses` on KYB approval.
 *
 * Expected — present on Noah Business customer, not mapped in v1:
 * - IncorporationDate
 * - Email / PhoneNumber (operational support contact stays user-entered)
 * - RegisteredAddress.Street2
 * - EntityVerifications[] (aggregate status only via map-kyc)
 * - Additional UBOs beyond the representative person on the customer object
 *
 * Representative person fields (FullName, DateOfBirth, Identities, PrimaryResidence) are synced
 * to the org owner `users` row via parseNoahCustomerForUsers in sync-user.ts.
 */

import { countryDisplayName, normalizeCountryIso } from "@easner/shared/verified-identity"

export type ParsedNoahCustomerForBusiness = {
  name?: string
  registration_number?: string | null
  country?: string | null
  address_line1?: string | null
  city?: string | null
  state?: string | null
  postal_code?: string | null
  kyb_verified_at?: string
}

function pickString(obj: Record<string, unknown>, ...keys: string[]): string | null {
  for (const k of keys) {
    const v = obj[k]
    if (typeof v === "string" && v.trim()) return v.trim()
  }
  return null
}

function titleCaseWord(word: string): string {
  if (!word) return word
  return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
}

const ADDRESS_TOKEN = /^([^\w]*)([\w]+)([^\w]*)$/

function titleCaseAddressToken(word: string): string {
  const m = word.match(ADDRESS_TOKEN)
  if (!m) return word
  const [, lead, core, trail] = m
  if (/^[A-Z]{2}$/.test(core)) return `${lead}${core}${trail}`
  if (core !== core.toUpperCase() && core !== core.toLowerCase()) {
    return `${lead}${core}${trail}`
  }
  return `${lead}${titleCaseWord(core)}${trail}`
}

function titleCaseAddressPart(input: string | null | undefined): string {
  const raw = String(input ?? "").trim()
  if (!raw) return ""
  return raw
    .split(",")
    .map((segment) =>
      segment
        .trim()
        .split(/\s+/)
        .map((w) => titleCaseAddressToken(w))
        .join(" "),
    )
    .join(", ")
}

function registeredAddress(customer: Record<string, unknown>): Record<string, unknown> | null {
  const raw = customer.RegisteredAddress ?? customer.registeredAddress
  return raw && typeof raw === "object" ? (raw as Record<string, unknown>) : null
}

function verificationOccurredAt(customer: Record<string, unknown>, fallback?: string): string {
  const raw =
    pickString(customer, "Occurred", "occurred") ??
    pickString(
      (customer.Verifications as Record<string, unknown> | undefined) ?? {},
      "Occurred",
      "occurred",
    ) ??
    fallback
  if (raw) {
    const d = new Date(raw)
    if (!Number.isNaN(d.getTime())) return d.toISOString()
  }
  return new Date().toISOString()
}

function countryDisplayFromIso(iso: string | null): string | null {
  if (!iso) return null
  const name = countryDisplayName(iso)
  return name || iso
}

/**
 * Parse approved Noah Business customer for org row updates.
 * Call only when KYB verification status is approved.
 */
export function parseNoahCustomerForBusiness(
  customer: Record<string, unknown>,
  options?: { occurredAt?: string },
): ParsedNoahCustomerForBusiness {
  const out: ParsedNoahCustomerForBusiness = {
    kyb_verified_at: verificationOccurredAt(customer, options?.occurredAt),
  }

  const registeredName = pickString(customer, "RegisteredName", "registeredName")
  if (registeredName) out.name = registeredName.trim()

  const registrationNumber = pickString(
    customer,
    "RegistrationNumber",
    "registrationNumber",
  )
  if (registrationNumber) out.registration_number = registrationNumber

  const registrationCountry = normalizeCountryIso(
    customer.RegistrationCountry ?? customer.registrationCountry,
  )

  const address = registeredAddress(customer)
  if (address) {
    const street = pickString(address, "Street", "StreetLine1", "street", "AddressLine1")
    const city = pickString(address, "City", "city")
    const state = pickString(address, "State", "state", "Region", "region")
    const postCode = pickString(address, "PostCode", "PostalCode", "postCode", "zip")
    const addressCountry = normalizeCountryIso(address.Country ?? address.country)
    if (street) out.address_line1 = titleCaseAddressPart(street)
    if (city) out.city = titleCaseAddressPart(city)
    if (state) out.state = state.length <= 4 && state === state.toUpperCase() ? state : titleCaseAddressPart(state)
    if (postCode) out.postal_code = postCode

    const countryIso = registrationCountry ?? addressCountry
    if (countryIso) out.country = countryDisplayFromIso(countryIso)
  } else if (registrationCountry) {
    out.country = countryDisplayFromIso(registrationCountry)
  }

  return out
}
