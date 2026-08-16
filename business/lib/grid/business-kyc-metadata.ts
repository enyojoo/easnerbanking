export type GridBusinessProfile = {
  legalName: string
  registrationNumber?: string | null
  taxId?: string | null
  country?: string | null
  addressLine1?: string | null
  city?: string | null
  state?: string | null
  postalCode?: string | null
  email?: string | null
  website?: string | null
  createdAt?: string | null
}

import { getKybFields } from "@/lib/kyb-by-country"
import { resolveBusinessCountryIso2 } from "./business-profile-shell"

function isoDateFromTimestamp(value: string | null | undefined): string | null {
  const raw = String(value ?? "").trim()
  if (!raw) return null
  const d = new Date(raw)
  if (Number.isNaN(d.getTime())) return null
  return d.toISOString().slice(0, 10)
}

function digitsOnly(value: string): string {
  return value.replace(/\D/g, "")
}

/**
 * Stable 9-digit placeholder historically sent on Grid BUSINESS create.
 * Kept only for detecting leaked shell values — do not send on new creates.
 */
export function gridShellBusinessTaxId(platformCustomerId: string): string {
  let hash = 0
  for (let i = 0; i < platformCustomerId.length; i++) {
    hash = (Math.imul(31, hash) + platformCustomerId.charCodeAt(i)) | 0
  }
  return String((Math.abs(hash) % 900_000_000) + 100_000_000)
}

export function isGridShellBusinessTaxId(
  taxId: string | null | undefined,
  platformCustomerId: string | null | undefined,
): boolean {
  const digits = digitsOnly(String(taxId ?? ""))
  const platformId = String(platformCustomerId ?? "").trim()
  if (!digits || !platformId) return false
  return digits === gridShellBusinessTaxId(platformId)
}

/** Normalize a user-supplied tax id for Grid (US EIN → 9 digits). */
export function normalizeStoredBusinessTaxId(raw: string | null | undefined): string | null {
  const trimmed = String(raw ?? "").trim()
  if (!trimmed) return null
  const digits = digitsOnly(trimmed)
  if (digits.length === 9) return digits
  if (digits.length >= 8) return digits
  return trimmed
}

/**
 * Resolve taxId for Grid BUSINESS create/update when we have a real value.
 * Returns null when the org has no tax id (hosted Sumsub collects it).
 */
export function resolveGridBusinessTaxId(input: {
  taxId?: string | null
  registrationNumber?: string | null
  country?: string | null
  platformCustomerId: string
}): string | null {
  const countryIso2 = resolveBusinessCountryIso2(input.country) ?? ""
  const fields = getKybFields(countryIso2)
  const collectsSeparateTaxId = fields.some((f) => f.id === "taxId")

  const fromTaxId = normalizeStoredBusinessTaxId(input.taxId)
  if (fromTaxId && !isGridShellBusinessTaxId(fromTaxId, input.platformCustomerId)) {
    return fromTaxId
  }

  if (!collectsSeparateTaxId) {
    const fromRegistration = normalizeStoredBusinessTaxId(input.registrationNumber)
    if (fromRegistration) return fromRegistration
  }

  return null
}

/**
 * Thin Grid BUSINESS customer for hosted KYB (SumSub collects the rest).
 * Grid docs: customer must exist before createKYCLink; omit fields we do not have.
 */
export function buildGridBusinessCustomerPayload(input: {
  platformCustomerId: string
  profile: GridBusinessProfile
  /**
   * Grid POST /customers on production still requires country, incorporatedOn, and taxId.
   * Use only on create — hosted KYB collects real values in Sumsub.
   */
  forGridCreate?: boolean
}): Record<string, unknown> {
  const legalName = String(input.profile.legalName ?? "").trim() || "Easner Business"
  const countryIso2 = resolveBusinessCountryIso2(input.profile.country)

  const businessInfo: Record<string, unknown> = { legalName }

  const taxId = resolveGridBusinessTaxId({
    taxId: input.profile.taxId,
    registrationNumber: input.profile.registrationNumber,
    country: input.profile.country,
    platformCustomerId: input.platformCustomerId,
  })
  if (taxId) businessInfo.taxId = taxId

  const registrationNumber = String(input.profile.registrationNumber ?? "").trim()
  if (registrationNumber) businessInfo.registrationNumber = registrationNumber

  // Hosted KYB: country/incorporation trigger Grid taxId validation — only send with a real taxId.
  if (taxId) {
    if (countryIso2) businessInfo.country = countryIso2
    const incorporatedOn = isoDateFromTimestamp(input.profile.createdAt)
    if (incorporatedOn) businessInfo.incorporatedOn = incorporatedOn
  } else if (input.forGridCreate) {
    if (countryIso2) businessInfo.country = countryIso2
    const incorporatedOn = isoDateFromTimestamp(input.profile.createdAt)
    if (incorporatedOn) businessInfo.incorporatedOn = incorporatedOn
    businessInfo.taxId = gridShellBusinessTaxId(input.platformCustomerId)
  }

  const payload: Record<string, unknown> = {
    customerType: "BUSINESS",
    platformCustomerId: input.platformCustomerId,
    businessInfo,
  }

  const email = String(input.profile.email ?? "").trim()
  if (!email) {
    throw new Error("Org owner contact email is required for Grid business verification")
  }
  payload.email = email

  return payload
}

export function readGridBusinessInfo(
  customer: Record<string, unknown>,
): Record<string, unknown> | null {
  const businessInfo = customer.businessInfo
  return businessInfo && typeof businessInfo === "object"
    ? (businessInfo as Record<string, unknown>)
    : null
}

function readGridBusinessInfoStringField(
  businessInfo: Record<string, unknown> | null,
  ...keys: string[]
): string | null | undefined {
  if (!businessInfo) return undefined
  const hasKey = keys.some((key) => key in businessInfo)
  if (!hasKey) return undefined
  const raw = keys.map((key) => businessInfo[key]).find((value) => value !== undefined)
  if (raw === null) return null
  if (typeof raw !== "string") return undefined
  const trimmed = raw.trim()
  return trimmed || null
}

/** True when Grid stores taxId as null/empty or a historic shell we no longer send. */
export function gridBusinessTaxIdIsInvalidOnGrid(input: {
  customer: Record<string, unknown>
  platformCustomerId: string
  profile: GridBusinessProfile
}): boolean {
  const businessInfo = readGridBusinessInfo(input.customer)
  const raw = readGridBusinessInfoStringField(businessInfo, "taxId", "tax_id")
  if (raw === null) return true
  if (raw === undefined) return false

  const desired = resolveGridBusinessTaxId({
    taxId: input.profile.taxId,
    registrationNumber: input.profile.registrationNumber,
    country: input.profile.country,
    platformCustomerId: input.platformCustomerId,
  })
  if (desired) return false
  return isGridShellBusinessTaxId(raw, input.platformCustomerId)
}

export function gridBusinessIncorporatedOnIsInvalidOnGrid(
  customer: Record<string, unknown>,
): boolean {
  const businessInfo = readGridBusinessInfo(customer)
  if (!businessInfo || !("incorporatedOn" in businessInfo)) return false
  const raw = businessInfo.incorporatedOn
  return raw === null || raw === ""
}

/** Grid rejects hosted KYB when country/incorporation are set without a real taxId. */
export function gridBusinessHostedKybBusinessInfoIsOverfilled(input: {
  customer: Record<string, unknown>
  platformCustomerId: string
  profile: GridBusinessProfile
}): boolean {
  const businessInfo = readGridBusinessInfo(input.customer)
  if (!businessInfo) return false

  const hasCountry = Boolean(String(businessInfo.country ?? "").trim())
  const hasIncorporatedOn = Boolean(String(businessInfo.incorporatedOn ?? "").trim())
  if (!hasCountry && !hasIncorporatedOn) return false

  const desiredTaxId = resolveGridBusinessTaxId({
    taxId: input.profile.taxId,
    registrationNumber: input.profile.registrationNumber,
    country: input.profile.country,
    platformCustomerId: input.platformCustomerId,
  })
  if (desiredTaxId) return false

  const rawTaxId = readGridBusinessInfoStringField(businessInfo, "taxId", "tax_id")
  if (rawTaxId === undefined) return true
  return gridBusinessTaxIdIsInvalidOnGrid(input)
}

export function gridBusinessKybStubFieldsNeedResync(input: {
  customer: Record<string, unknown>
  platformCustomerId: string
  profile: GridBusinessProfile
}): boolean {
  if (gridBusinessTaxIdIsInvalidOnGrid(input)) return true
  if (gridBusinessHostedKybBusinessInfoIsOverfilled(input)) return true
  if (!gridBusinessIncorporatedOnIsInvalidOnGrid(input.customer)) return false
  return Boolean(isoDateFromTimestamp(input.profile.createdAt))
}

/** Grid POST /customers create stubs we still need to scrub before hosted KYB. */
export function gridBusinessInfoIsHistoricCreateStub(input: {
  customer: Record<string, unknown>
  platformCustomerId: string
  profile: GridBusinessProfile
}): boolean {
  if (!gridBusinessKybStubFieldsNeedResync(input)) return false

  const businessInfo = readGridBusinessInfo(input.customer)
  if (!businessInfo) return false

  const taxRaw = readGridBusinessInfoStringField(businessInfo, "taxId", "tax_id")
  if (taxRaw && !isGridShellBusinessTaxId(taxRaw, input.platformCustomerId)) {
    return false
  }

  const incorporatedOn = readGridBusinessInfoStringField(
    businessInfo,
    "incorporatedOn",
    "incorporated_on",
  )
  const expectedIncorp = isoDateFromTimestamp(input.profile.createdAt)
  if (incorporatedOn && expectedIncorp && incorporatedOn !== expectedIncorp) {
    return false
  }

  const country = readGridBusinessInfoStringField(businessInfo, "country")
  const expectedCountry = resolveBusinessCountryIso2(input.profile.country)
  if (country && expectedCountry && country !== expectedCountry) {
    return false
  }

  return true
}

export type GridHostedKybInFlightContext = {
  platformCustomerId: string
  profile: GridBusinessProfile
}

/**
 * True when the org has started hosted KYB in SumSub — never delete/recreate or stub-scrub
 * on kyc-link refresh (that wipes in-progress applicant data).
 */
export function gridCustomerHasHostedKybInFlight(
  customer: Record<string, unknown>,
  context?: GridHostedKybInFlightContext,
): boolean {
  const status = String(customer.kybStatus ?? customer.kycStatus ?? "")
    .trim()
    .toUpperCase()
  if (status === "PENDING") return true

  const beneficialOwners = Array.isArray(customer.beneficialOwners)
    ? (customer.beneficialOwners as unknown[])
    : []
  if (beneficialOwners.length > 0) return true

  if (context && gridBusinessInfoIsHistoricCreateStub({ customer, ...context })) {
    return false
  }

  const businessInfo = readGridBusinessInfo(customer)
  if (!businessInfo) return false

  const legalName = readGridBusinessInfoStringField(businessInfo, "legalName", "legal_name")
  const tradeName = readGridBusinessInfoStringField(businessInfo, "tradeName", "trade_name")
  const country = readGridBusinessInfoStringField(businessInfo, "country")
  const incorporatedOn = readGridBusinessInfoStringField(
    businessInfo,
    "incorporatedOn",
    "incorporated_on",
  )
  const hasName = Boolean(legalName?.trim() || tradeName?.trim())
  const hasHostedFields = Boolean(country?.trim() || incorporatedOn?.trim())
  return hasName && hasHostedFields
}

/** Canonical businessInfo we would send on a fresh thin create for hosted KYB. */
export function buildGridBusinessInfoResyncPatch(input: {
  platformCustomerId: string
  profile: GridBusinessProfile
}): Record<string, unknown> {
  const payload = buildGridBusinessCustomerPayload(input)
  return (payload.businessInfo ?? {}) as Record<string, unknown>
}

/** Explicitly clear Grid create stubs that block hosted KYB link creation. */
export function buildGridBusinessInfoScrubPatch(input: {
  platformCustomerId: string
  profile: GridBusinessProfile
}): Record<string, unknown> {
  return {
    ...buildGridBusinessInfoResyncPatch(input),
    taxId: null,
    country: null,
    incorporatedOn: null,
  }
}
