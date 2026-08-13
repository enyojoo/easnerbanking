import {
  countryDisplayName,
  formatDisplayPersonName,
  normalizeCountryIso,
} from "@easner/shared"

export type ParsedGridOwnerForUsers = {
  full_name?: string
  date_of_birth?: string | null
  residence_country?: string | null
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

function readObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function pickString(obj: Record<string, unknown> | null, ...keys: string[]): string | null {
  if (!obj) return null
  for (const key of keys) {
    const v = obj[key]
    if (typeof v === "string" && v.trim()) return v.trim()
  }
  return null
}

function normalizeName(value: string | null | undefined): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
}

function nameTokens(value: string | null | undefined): string[] {
  return normalizeName(value).split(" ").filter(Boolean)
}

function namesLikelyMatch(a: string, b: string): boolean {
  if (!a || !b) return false
  if (a === b) return true
  if (a.includes(b) || b.includes(a)) return true
  const aTokens = nameTokens(a)
  const bTokens = nameTokens(b)
  if (aTokens.length === 0 || bTokens.length === 0) return false
  const shared = aTokens.filter((t) => bTokens.includes(t))
  return shared.length >= 2 || (shared.length === 1 && aTokens.length === 1 && bTokens.length === 1)
}

function ownerRoles(owner: Record<string, unknown>): string[] {
  const raw = owner.roles ?? owner.Roles
  if (!Array.isArray(raw)) return []
  return raw.map((r) => String(r).toUpperCase())
}

function ownershipPct(owner: Record<string, unknown>): number {
  const n = Number(owner.ownershipPercentage ?? owner.ownership_percentage)
  return Number.isFinite(n) ? n : 0
}

function beneficialOwnerDisplayName(owner: Record<string, unknown>): string {
  const personalInfo = readObject(owner.personalInfo)
  return normalizeName(
    [
      pickString(personalInfo, "firstName", "first_name"),
      pickString(personalInfo, "middleName", "middle_name"),
      pickString(personalInfo, "lastName", "last_name"),
    ]
      .filter(Boolean)
      .join(" "),
  )
}

/** Prefer owner name match, then highest-ownership UBO, else first beneficial owner. */
export function pickGridBeneficialOwner(
  customer: Record<string, unknown>,
  opts?: { ownerEmail?: string | null; ownerFullName?: string | null },
): Record<string, unknown> | null {
  const raw = customer.beneficialOwners ?? customer.beneficial_owners
  if (!Array.isArray(raw) || raw.length === 0) return null

  const owners = raw
    .map((o) => readObject(o))
    .filter((o): o is Record<string, unknown> => Boolean(o))
  if (owners.length === 0) return null

  const ownerName = normalizeName(opts?.ownerFullName)
  if (ownerName) {
    const byName = owners.find((o) => namesLikelyMatch(beneficialOwnerDisplayName(o), ownerName))
    if (byName) return byName
  }

  const ubos = owners.filter((o) => ownerRoles(o).includes("UBO"))
  const pool = ubos.length > 0 ? ubos : owners
  return [...pool].sort((a, b) => ownershipPct(b) - ownershipPct(a))[0]
}

function mapGridIdTypeLabel(idType: string | null): string | null {
  if (!idType) return null
  const normalized = idType.trim().toUpperCase()
  if (normalized === "NON_US_TAX_ID") return "Tax ID"
  if (normalized === "US_SSN") return "SSN"
  if (normalized === "PASSPORT") return "Passport"
  return idType.replace(/_/g, " ").trim() || null
}

/** Map Grid beneficial owner personalInfo → owner `users` KYC profile columns. */
export function parseGridBeneficialOwnerForOwnerUsers(
  customer: Record<string, unknown>,
  opts?: { ownerEmail?: string | null; ownerFullName?: string | null },
): ParsedGridOwnerForUsers {
  const owner = pickGridBeneficialOwner(customer, opts)
  const personalInfo = readObject(owner?.personalInfo)
  if (!personalInfo) return {}

  const out: ParsedGridOwnerForUsers = {}
  const fullName = formatDisplayPersonName(
    [
      pickString(personalInfo, "firstName", "first_name"),
      pickString(personalInfo, "middleName", "middle_name"),
      pickString(personalInfo, "lastName", "last_name"),
    ]
      .filter(Boolean)
      .join(" "),
  )
  if (fullName) out.full_name = fullName

  const birthDate = pickString(personalInfo, "birthDate", "birth_date", "dateOfBirth")
  if (birthDate) out.date_of_birth = birthDate

  const nationalityIso = normalizeCountryIso(personalInfo.nationality)
  if (nationalityIso) out.residence_country = nationalityIso

  const idType = mapGridIdTypeLabel(pickString(personalInfo, "idType", "id_type"))
  if (idType) out.kyc_id_type = idType

  const identifier = pickString(personalInfo, "identifier", "idNumber", "id_number")
  if (identifier) out.kyc_id_number = identifier

  const issuingCountryIso =
    normalizeCountryIso(personalInfo.countryOfIssuance) ??
    normalizeCountryIso(personalInfo.country_of_issuance)
  if (issuingCountryIso) {
    out.kyc_id_issuing_country = countryDisplayName(issuingCountryIso) || issuingCountryIso
  }

  const address = readObject(personalInfo.address)
  if (address) {
    const line1 = pickString(address, "line1", "line_1", "street")
    const line2 = pickString(address, "line2", "line_2")
    const street = [line1, line2].filter(Boolean).join(", ")
    if (street) out.kyc_address_street = street

    const city = pickString(address, "city")
    if (city) out.kyc_address_city = city

    const state = pickString(address, "state", "region")
    if (state) out.kyc_address_state = state

    const postal = pickString(address, "postalCode", "postal_code", "zip")
    if (postal) out.kyc_address_post_code = postal

    const countryIso = normalizeCountryIso(address.country)
    if (countryIso) out.kyc_address_country = countryDisplayName(countryIso) || countryIso
  }

  const kycStatus = String(owner?.kycStatus ?? owner?.kyc_status ?? "").toUpperCase()
  if (kycStatus === "APPROVED") {
    out.kyc_verified_at = new Date().toISOString()
  }

  return out
}
