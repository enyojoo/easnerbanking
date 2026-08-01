/**
 * Verified identity display payload (Noah KYC columns on `public.users`).
 * Shared by business API and mobile profile snapshot hydration.
 */

export type VerifiedCountryRef = {
  code: string
  name: string
}

export type VerifiedIdentityPayload = {
  visible: boolean
  idType?: string | null
  idTypeRaw?: string | null
  idNumberMasked?: string | null
  issuingCountry?: VerifiedCountryRef | null
  addressLines?: string[]
  addressCountry?: VerifiedCountryRef | null
}

const ID_TYPE_LABELS: Record<string, string> = {
  TaxID: "Tax ID",
  SSN: "SSN",
  SocialSecurityNumber: "SSN",
  Passport: "Passport",
  NationalID: "National ID",
  NationalId: "National ID",
  DriversLicense: "Driver's License",
}

export function mapNoahIdTypeLabel(raw: string | null | undefined): string {
  if (!raw || !String(raw).trim()) return ""
  const key = String(raw).trim()
  if (ID_TYPE_LABELS[key]) return ID_TYPE_LABELS[key]
  return key
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/_/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

/** Show first 4 and last 4 characters; middle obscured. */
export function maskIdNumber(full: string | null | undefined): string {
  const s = String(full ?? "").replace(/\s/g, "")
  if (s.length <= 4) return "••••"
  if (s.length <= 8) {
    const first = s.slice(0, Math.min(4, s.length - 1))
    const last = s.slice(-Math.min(4, s.length - first.length))
    const mid = Math.max(0, s.length - first.length - last.length)
    return `${first}${"•".repeat(Math.max(mid, 1))}${last}`
  }
  const first = s.slice(0, 4)
  const last = s.slice(-4)
  const hidden = s.length - 8
  return `${first}${"•".repeat(Math.max(hidden, 3))}${last}`
}

export function normalizeCountryIso(value: unknown): string | null {
  if (value == null) return null
  const s = String(value).trim().toUpperCase()
  if (/^[A-Z]{2}$/.test(s)) return s
  return null
}

/** Short display names for countries where Intl names are too long for lists. */
export const COUNTRY_DISPLAY_NAME_OVERRIDES: Record<string, string> = {
  CD: "DR Congo",
  CG: "Congo",
  HK: "Hong Kong",
}

/** Primary local fiat for payout/pay-in corridors (one currency per country+rail in DB). */
export const LOCAL_PAYMENT_CURRENCY_BY_COUNTRY: Record<string, string> = {
  DK: "DKK",
  GB: "GBP",
  ET: "ETB",
  LK: "LKR",
}

export function localPaymentCurrencyForCountry(countryCode: string | null | undefined): string | null {
  const cc = normalizeCountryIso(countryCode) ?? ""
  return cc ? (LOCAL_PAYMENT_CURRENCY_BY_COUNTRY[cc] ?? null) : null
}

/** Country display name for API (ISO-2 in DB). */
export function countryDisplayName(iso: string | null | undefined, locale = "en"): string {
  const code = normalizeCountryIso(iso) ?? ""
  if (!code) return ""
  const override = COUNTRY_DISPLAY_NAME_OVERRIDES[code]
  if (override) return override
  try {
    const dn = new Intl.DisplayNames([locale], { type: "region" })
    return dn.of(code) ?? code
  } catch {
    return code
  }
}

export type ProfileLockOptions = {
  orgKybApproved?: boolean
}

export function isBusinessProfileLockedFromKybFields(
  row: Record<string, unknown> | null | undefined,
): boolean {
  if (!row) return false
  const provider = String(row.verification_provider ?? "").toLowerCase()
  const status =
    provider === "grid"
      ? String(row.verification_status ?? "").toLowerCase()
      : String(row.verification_status ?? row.noah_kyb_status ?? "").toLowerCase()
  return status === "approved" && row.kyb_verified_at != null
}

export function isProfileLockedFromKycFields(
  row: Record<string, unknown> | null | undefined,
  opts?: ProfileLockOptions,
): boolean {
  if (!row?.kyc_verified_at) return false
  const status = String(row.noah_kyc_status ?? "").toLowerCase()
  if (status === "approved") return true
  if (opts?.orgKybApproved && row.kyc_id_type) return true
  return false
}

/** Spaced display for masked ID (e.g. `2238 • • • 5976`). */
export function formatMaskedIdForDisplay(masked: string | null | undefined): string {
  const raw = String(masked ?? "").trim()
  if (!raw) return ""
  const compact = raw.replace(/\s/g, "")
  const m = compact.match(/^(.{4})([•]+)(.{4})$/)
  if (m) {
    const spacedBullets = m[2].split("").join(" ")
    return `${m[1]} ${spacedBullets} ${m[3]}`
  }
  if (compact.length >= 9) {
    const first = compact.slice(0, 4)
    const last = compact.slice(-4)
    const middleLen = compact.length - 8
    const spacedBullets = Array(Math.max(middleLen, 1))
      .fill("•")
      .join(" ")
    return `${first} ${spacedBullets} ${last}`
  }
  return raw
}

/** Single flowing address line — street, locality, country name (comma-separated). */
export function formatVerifiedAddressDisplay(
  identity: Pick<VerifiedIdentityPayload, "addressLines" | "addressCountry">,
): string {
  const parts: string[] = []
  for (const line of identity.addressLines ?? []) {
    const t = line.trim()
    if (t) parts.push(t)
  }
  const country = identity.addressCountry?.name?.trim()
  if (country) parts.push(country)
  return parts.join(", ")
}

export function buildVerifiedIdentityFromKycFields(
  row: Record<string, unknown> | null | undefined,
  opts?: ProfileLockOptions,
): VerifiedIdentityPayload {
  if (!row || !isProfileLockedFromKycFields(row, opts)) {
    return { visible: false }
  }
  const hasId = Boolean(row.kyc_id_type || row.kyc_id_number)
  const hasAddress = Boolean(row.kyc_address_street)
  if (!hasId && !hasAddress) {
    return { visible: false }
  }

  const issuingCode =
    typeof row.kyc_id_issuing_country === "string" ? row.kyc_id_issuing_country.trim().toUpperCase() : ""
  const addressCountryCode =
    typeof row.kyc_address_country === "string" ? row.kyc_address_country.trim().toUpperCase() : ""

  const addressLines: string[] = []
  if (typeof row.kyc_address_street === "string" && row.kyc_address_street.trim()) {
    addressLines.push(row.kyc_address_street.trim())
  }
  const cityLine = [
    typeof row.kyc_address_city === "string" ? row.kyc_address_city.trim() : "",
    typeof row.kyc_address_state === "string" ? row.kyc_address_state.trim() : "",
    typeof row.kyc_address_post_code === "string" ? row.kyc_address_post_code.trim() : "",
  ]
    .filter(Boolean)
    .join(", ")
  if (cityLine) addressLines.push(cityLine)

  const idTypeRaw = typeof row.kyc_id_type === "string" ? row.kyc_id_type : null

  return {
    visible: true,
    idType: idTypeRaw ? mapNoahIdTypeLabel(idTypeRaw) : null,
    idTypeRaw,
    idNumberMasked:
      typeof row.kyc_id_number === "string" && row.kyc_id_number.trim()
        ? maskIdNumber(row.kyc_id_number)
        : null,
    issuingCountry: issuingCode
      ? { code: issuingCode, name: countryDisplayName(issuingCode) }
      : null,
    addressLines,
    addressCountry: addressCountryCode
      ? { code: addressCountryCode, name: countryDisplayName(addressCountryCode) }
      : null,
  }
}
