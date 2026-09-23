import { countryDisplayName, formatDisplayPersonName } from "@easner/shared"

/** Bridge addresses use ISO 3166-1 alpha-3. Identity columns store alpha-2. */
const ALPHA3_TO_ALPHA2: Record<string, string> = {
  ARE: "AE",
  AUS: "AU",
  AUT: "AT",
  BEL: "BE",
  BRA: "BR",
  CAN: "CA",
  CHE: "CH",
  CIV: "CI",
  CMR: "CM",
  CZE: "CZ",
  DEU: "DE",
  DNK: "DK",
  EGY: "EG",
  ESP: "ES",
  FIN: "FI",
  FRA: "FR",
  GBR: "GB",
  GHA: "GH",
  GRC: "GR",
  HKG: "HK",
  HUN: "HU",
  IND: "IN",
  IRL: "IE",
  ITA: "IT",
  JPN: "JP",
  KEN: "KE",
  KOR: "KR",
  MAR: "MA",
  MEX: "MX",
  NGA: "NG",
  NLD: "NL",
  NOR: "NO",
  NZL: "NZ",
  POL: "PL",
  PRT: "PT",
  ROU: "RO",
  RWA: "RW",
  SEN: "SN",
  SGP: "SG",
  SWE: "SE",
  TUR: "TR",
  TZA: "TZ",
  UGA: "UG",
  USA: "US",
  ZAF: "ZA",
}

const GOV_ID_TYPES = new Set([
  "passport",
  "drivers_license",
  "drivers_licence",
  "national_id",
  "state_or_provincial_id",
  "permanent_residency_id",
  "visa",
  "matriculate_id",
])

const ID_TYPE_LABELS: Record<string, string> = {
  passport: "Passport",
  drivers_license: "DriversLicense",
  drivers_licence: "DriversLicense",
  national_id: "NationalID",
  state_or_provincial_id: "NationalID",
  permanent_residency_id: "NationalID",
  visa: "Passport",
  matriculate_id: "NationalID",
  ssn: "SSN",
  itin: "TaxID",
  ein: "TaxID",
  tin: "TaxID",
  other: "TaxID",
}

export type ParsedBridgeCustomerForUsers = {
  full_name?: string
  date_of_birth?: string | null
  phone?: string | null
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

export type ParsedBridgeCustomerForBusiness = {
  name?: string
  description?: string | null
  website?: string | null
  tax_id?: string | null
  registration_number?: string | null
  country?: string | null
  registration_country?: string | null
  address_line1?: string | null
  city?: string | null
  state?: string | null
  postal_code?: string | null
  registered_address_line1?: string | null
  registered_address_city?: string | null
  registered_address_state?: string | null
  registered_address_postal_code?: string | null
  kyb_verified_at?: string
}

function readObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null
}

function pickString(obj: Record<string, unknown> | null, ...keys: string[]): string | null {
  if (!obj) return null
  for (const key of keys) {
    const value = obj[key]
    if (typeof value === "string" && value.trim()) return value.trim()
  }
  return null
}

export function bridgeCountryToIso2(value: unknown): string | null {
  const raw = String(value ?? "").trim().toUpperCase()
  if (!raw) return null
  if (/^[A-Z]{2}$/.test(raw)) return raw
  return ALPHA3_TO_ALPHA2[raw] ?? null
}

function usableIdNumber(value: string | null): string | null {
  const raw = String(value ?? "").trim()
  if (!raw) return null
  const compact = raw.replace(/[\s-]/g, "")
  if (/^[xX*•.]+$/.test(compact)) return null
  return raw
}

function addressOf(customer: Record<string, unknown>, ...keys: string[]): Record<string, unknown> | null {
  for (const key of keys) {
    const row = readObject(customer[key])
    if (row && pickString(row, "street_line_1", "street_line1", "line1", "street")) return row
    if (row && (pickString(row, "city") || pickString(row, "country"))) return row
  }
  return null
}

function addressPatch(address: Record<string, unknown> | null): {
  street: string | null
  city: string | null
  state: string | null
  postal: string | null
  country: string | null
} {
  if (!address) return { street: null, city: null, state: null, postal: null, country: null }
  const line1 = pickString(address, "street_line_1", "street_line1", "line1", "street")
  const line2 = pickString(address, "street_line_2", "street_line2", "line2")
  const street = [line1, line2].filter(Boolean).join(", ") || null
  return {
    street,
    city: pickString(address, "city"),
    state: pickString(address, "subdivision", "state", "region"),
    postal: pickString(address, "postal_code", "postalCode", "zip"),
    country: bridgeCountryToIso2(pickString(address, "country")),
  }
}

function idDocuments(customer: Record<string, unknown>): Array<Record<string, unknown>> {
  const raw = customer.identifying_information ?? customer.identifyingInformation
  if (!Array.isArray(raw)) return []
  return raw.filter((row): row is Record<string, unknown> => Boolean(row) && typeof row === "object")
}

function pickIdentity(customer: Record<string, unknown>): Record<string, unknown> | null {
  const docs = idDocuments(customer)
  const gov = docs.find((row) => GOV_ID_TYPES.has(String(row.type ?? "").trim().toLowerCase()))
  return gov ?? docs[0] ?? null
}

function personName(source: Record<string, unknown>): string | null {
  const parts = [
    pickString(source, "first_name", "firstName"),
    pickString(source, "middle_name", "middleName"),
    pickString(source, "last_name", "lastName"),
  ].filter((part): part is string => Boolean(part))
  const combined = parts.length ? parts.join(" ") : pickString(source, "full_name", "fullName")
  if (!combined) return null
  return formatDisplayPersonName(combined)
}

function applyIdentity(
  out: ParsedBridgeCustomerForUsers,
  source: Record<string, unknown>,
  addressKeys: string[],
): void {
  const name = personName(source)
  if (name) out.full_name = name

  const dob = pickString(source, "birth_date", "birthDate", "date_of_birth")
  if (dob) out.date_of_birth = dob.slice(0, 10)

  const phone = pickString(source, "phone")
  if (phone) out.phone = phone

  const identity = pickIdentity(source)
  if (identity) {
    const typeKey = String(identity.type ?? "").trim().toLowerCase()
    const label = ID_TYPE_LABELS[typeKey]
    if (label) out.kyc_id_type = label
    const number = usableIdNumber(pickString(identity, "number"))
    if (number) out.kyc_id_number = number
    const issuing = bridgeCountryToIso2(pickString(identity, "issuing_country", "issuingCountry"))
    if (issuing) out.kyc_id_issuing_country = issuing
  }

  const address = addressPatch(addressOf(source, ...addressKeys))
  if (address.street) out.kyc_address_street = address.street
  if (address.city) out.kyc_address_city = address.city
  if (address.state) out.kyc_address_state = address.state
  if (address.postal) out.kyc_address_post_code = address.postal
  if (address.country) out.kyc_address_country = address.country
}

/** Identity columns from a Bridge individual customer. Omitted fields are left unchanged in the DB. */
export function parseBridgeCustomerForUsers(
  customer: Record<string, unknown>,
  options?: { approved?: boolean; occurredAt?: string },
): ParsedBridgeCustomerForUsers {
  const out: ParsedBridgeCustomerForUsers = {}
  applyIdentity(out, customer, [
    "residential_address",
    "transliterated_residential_address",
    "address",
  ])
  if (options?.approved) {
    out.kyc_verified_at = options.occurredAt ?? new Date().toISOString()
  }
  return out
}

function taxOrRegistration(customer: Record<string, unknown>): { taxId: string | null; registration: string | null } {
  let taxId: string | null = null
  let registration: string | null = null
  for (const row of idDocuments(customer)) {
    const type = String(row.type ?? "").trim().toLowerCase()
    const number = usableIdNumber(pickString(row, "number"))
    if (!number) continue
    if (!taxId && (type === "ein" || type === "tin" || type === "ssn" || type === "itin" || type === "other")) {
      taxId = number
    }
    if (
      !registration &&
      (type === "registration_number" || type === "company_registration" || type === "business_registration")
    ) {
      registration = number
    }
  }
  return { taxId, registration }
}

/** Company columns from a Bridge business customer. */
export function parseBridgeCustomerForBusiness(
  customer: Record<string, unknown>,
  options?: { approved?: boolean; occurredAt?: string },
): ParsedBridgeCustomerForBusiness {
  const out: ParsedBridgeCustomerForBusiness = {}
  const legalName =
    pickString(customer, "business_legal_name", "businessLegalName") ??
    (String(customer.type ?? "").trim().toLowerCase() === "business"
      ? pickString(customer, "full_name", "fullName")
      : null)
  if (legalName) out.name = legalName
  const description = pickString(customer, "business_description", "businessDescription")
  if (description) out.description = description
  const website = pickString(customer, "primary_website", "primaryWebsite")
  if (website) out.website = website

  const ids = taxOrRegistration(customer)
  if (ids.taxId) out.tax_id = ids.taxId
  if (ids.registration) out.registration_number = ids.registration

  const address = addressPatch(
    addressOf(customer, "registered_address", "physical_address", "transliterated_registered_address", "address"),
  )
  if (address.street) {
    out.address_line1 = address.street
    out.registered_address_line1 = address.street
  }
  if (address.city) {
    out.city = address.city
    out.registered_address_city = address.city
  }
  if (address.state) {
    out.state = address.state
    out.registered_address_state = address.state
  }
  if (address.postal) {
    out.postal_code = address.postal
    out.registered_address_postal_code = address.postal
  }
  if (address.country) {
    const display = countryDisplayName(address.country) || address.country
    out.country = display
    out.registration_country = display
  }

  if (options?.approved) {
    out.kyb_verified_at = options.occurredAt ?? new Date().toISOString()
  }
  return out
}

export function parseBridgeAssociatedPersonForUsers(
  customer: Record<string, unknown>,
  options?: { ownerEmail?: string | null; approved?: boolean; occurredAt?: string },
): ParsedBridgeCustomerForUsers {
  const raw = customer.associated_persons ?? customer.associatedPersons
  if (!Array.isArray(raw)) return {}
  const people = raw.filter((row): row is Record<string, unknown> => Boolean(row) && typeof row === "object")
  const wanted = String(options?.ownerEmail ?? "").trim().toLowerCase()
  const match =
    (wanted
      ? people.find((person) => String(person.email ?? "").trim().toLowerCase() === wanted)
      : null) ??
    people.find((person) => person.has_control === true || person.is_signer === true) ??
    people[0]
  if (!match) return {}
  const out: ParsedBridgeCustomerForUsers = {}
  applyIdentity(out, match, ["residential_address", "transliterated_residential_address", "address"])
  if (options?.approved && Object.keys(out).length > 0) {
    out.kyc_verified_at = options.occurredAt ?? new Date().toISOString()
  }
  return out
}
