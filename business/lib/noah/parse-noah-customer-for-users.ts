/**
 * Map Noah Customer payload → `public.users` profile + KYC columns (normalized on write).
 */

import {
  countryDisplayName,
  formatDisplayPersonName,
  mapNoahIdTypeLabel,
  maskIdNumber,
  normalizeCountryIso,
} from "@easner/shared"

export type ParsedNoahCustomerForUsers = {
  full_name?: string
  date_of_birth?: string | null
  kyc_id_type?: string | null
  kyc_id_number?: string | null
  kyc_id_issuing_country?: string | null
  kyc_address_street?: string | null
  kyc_address_city?: string | null
  kyc_address_state?: string | null
  kyc_address_post_code?: string | null
  kyc_address_country?: string | null
  kyc_verified_at?: string
}

export { countryDisplayName, mapNoahIdTypeLabel, maskIdNumber, normalizeCountryIso }

/** @deprecated Use {@link formatDisplayPersonName} from `@easner/shared`. */
export const titleCaseName = formatDisplayPersonName

function titleCaseWord(word: string): string {
  if (!word) return word
  return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
}

const ADDRESS_TOKEN = /^([^\w]*)([\w]+)([^\w]*)$/

/** Keep US state / country codes (PA, US, NY) and similar 2-letter caps tokens. */
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

export function titleCaseAddressPart(input: string | null | undefined): string {
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

function formatAddressState(input: string): string {
  const raw = input.trim()
  if (raw.length <= 4 && raw === raw.toUpperCase()) return raw
  return titleCaseAddressPart(raw)
}

function pickString(obj: Record<string, unknown>, ...keys: string[]): string | null {
  for (const k of keys) {
    const v = obj[k]
    if (typeof v === "string" && v.trim()) return v.trim()
  }
  return null
}

/** Noah may send FullName as a string or { FirstName, MiddleName?, LastName }. */
export function parseNoahFullName(customer: Record<string, unknown>): string | null {
  const raw = customer.FullName ?? customer.fullName ?? customer.full_name
  if (typeof raw === "string" && raw.trim()) return raw.trim()
  if (raw && typeof raw === "object") {
    const o = raw as Record<string, unknown>
    const parts = [
      pickString(o, "FirstName", "firstName", "GivenName", "givenName"),
      pickString(o, "MiddleName", "middleName"),
      pickString(o, "LastName", "lastName", "FamilyName", "familyName"),
    ].filter((p): p is string => Boolean(p))
    if (parts.length) return parts.join(" ")
  }
  const topLevel = [
    pickString(customer, "FirstName", "firstName", "GivenName", "givenName"),
    pickString(customer, "MiddleName", "middleName"),
    pickString(customer, "LastName", "lastName", "FamilyName", "familyName"),
  ].filter((p): p is string => Boolean(p))
  return topLevel.length ? topLevel.join(" ") : null
}

function firstIdentity(customer: Record<string, unknown>): Record<string, unknown> | null {
  const raw = customer.Identities ?? customer.identities
  if (!Array.isArray(raw) || raw.length === 0) return null
  const first = raw[0]
  return first && typeof first === "object" ? (first as Record<string, unknown>) : null
}

function primaryResidence(customer: Record<string, unknown>): Record<string, unknown> | null {
  const raw = customer.PrimaryResidence ?? customer.primaryResidence
  return raw && typeof raw === "object" ? (raw as Record<string, unknown>) : null
}

function parseDateOfBirth(customer: Record<string, unknown>): string | null {
  const raw = pickString(customer, "DateOfBirth", "dateOfBirth", "date_of_birth")
  if (!raw) return null
  const m = raw.match(/^(\d{4}-\d{2}-\d{2})/)
  return m ? m[1] : raw.slice(0, 10)
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

/**
 * Parse approved Noah Customer `Data` for individual user row updates.
 * Call only when verification status is approved.
 */
export function parseNoahCustomerForUsers(
  customer: Record<string, unknown>,
  options?: { occurredAt?: string },
): ParsedNoahCustomerForUsers {
  const identity = firstIdentity(customer)
  const residence = primaryResidence(customer)

  const out: ParsedNoahCustomerForUsers = {
    kyc_verified_at: verificationOccurredAt(customer, options?.occurredAt),
  }

  const fullName = parseNoahFullName(customer)
  if (fullName) out.full_name = formatDisplayPersonName(fullName)

  const dob = parseDateOfBirth(customer)
  if (dob) out.date_of_birth = dob

  if (identity) {
    const idType = pickString(identity, "IDType", "IdType", "idType", "type")
    const idNumber = pickString(identity, "IDNumber", "IdNumber", "idNumber", "number")
    const issuing = normalizeCountryIso(
      identity.IssuingCountry ?? identity.issuingCountry ?? identity.Country ?? identity.country,
    )
    if (idType) out.kyc_id_type = idType
    if (idNumber) out.kyc_id_number = idNumber
    if (issuing) out.kyc_id_issuing_country = issuing
  }

  if (residence) {
    const street = pickString(
      residence,
      "Street",
      "StreetLine1",
      "street",
      "AddressLine1",
      "addressLine1",
    )
    const city = pickString(residence, "City", "city")
    const state = pickString(residence, "State", "state", "Region", "region")
    const postCode = pickString(residence, "PostCode", "PostalCode", "postCode", "zip")
    const country = normalizeCountryIso(residence.Country ?? residence.country)
    if (street) out.kyc_address_street = titleCaseAddressPart(street)
    if (city) out.kyc_address_city = titleCaseAddressPart(city)
    if (state) out.kyc_address_state = formatAddressState(state)
    if (postCode) out.kyc_address_post_code = postCode
    if (country) out.kyc_address_country = country
  }

  return out
}
