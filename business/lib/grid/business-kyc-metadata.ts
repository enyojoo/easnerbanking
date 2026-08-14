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
 * Stable 9-digit placeholder for Grid BUSINESS create when the org has no tax id yet.
 * Needed because Grid requires `businessInfo.taxId` at create, while our UX lets users
 * start hosted KYB (SumSub) without filling EIN in Easner first.
 *
 * Important: Grid/SumSub do not reliably overwrite this with the EIN collected in-host.
 * Prefer patching Grid once a real tax id is known (settings, approval backfill, or Grid support).
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
 * Resolve taxId for Grid BUSINESS create/update.
 * - Prefer real `taxId` when present.
 * - For registry-only countries (EE/CA), Grid still requires taxId — use registration number.
 * - Otherwise fall back to a deterministic shell so hosted KYB can start without a pre-form EIN.
 *   Do not use a separate US registration/file number as taxId (Delaware file # ≠ EIN).
 */
export function resolveGridBusinessTaxId(input: {
  taxId?: string | null
  registrationNumber?: string | null
  country?: string | null
  platformCustomerId: string
}): string {
  const countryIso2 = resolveBusinessCountryIso2(input.country) ?? ""
  const fields = getKybFields(countryIso2)
  const collectsSeparateTaxId = fields.some((f) => f.id === "taxId")

  const fromTaxId = normalizeStoredBusinessTaxId(input.taxId)
  if (fromTaxId) return fromTaxId

  if (!collectsSeparateTaxId) {
    const fromRegistration = normalizeStoredBusinessTaxId(input.registrationNumber)
    if (fromRegistration) return fromRegistration
  }

  return gridShellBusinessTaxId(input.platformCustomerId)
}

/**
 * Minimal Grid BUSINESS customer for hosted KYB (SumSub collects the rest).
 * Grid docs: customer must exist before createKYCLink; hosted flow ≠ API verifications.submit.
 */
export function buildGridBusinessCustomerPayload(input: {
  platformCustomerId: string
  profile: GridBusinessProfile
}): Record<string, unknown> {
  const legalName = String(input.profile.legalName ?? "").trim() || "Easner Business"
  const countryIso2 = resolveBusinessCountryIso2(input.profile.country)

  const businessInfo: Record<string, unknown> = { legalName }

  businessInfo.taxId = resolveGridBusinessTaxId({
    taxId: input.profile.taxId,
    registrationNumber: input.profile.registrationNumber,
    country: input.profile.country,
    platformCustomerId: input.platformCustomerId,
  })

  const registrationNumber = String(input.profile.registrationNumber ?? "").trim()
  if (registrationNumber) businessInfo.registrationNumber = registrationNumber

  if (countryIso2) businessInfo.country = countryIso2

  // Grid requires incorporatedOn on BUSINESS create; prefer org created_at.
  businessInfo.incorporatedOn =
    isoDateFromTimestamp(input.profile.createdAt) ?? new Date().toISOString().slice(0, 10)

  const payload: Record<string, unknown> = {
    customerType: "BUSINESS",
    platformCustomerId: input.platformCustomerId,
    businessInfo,
  }

  const email = String(input.profile.email ?? "").trim()
  if (!email) {
    throw new Error("Org owner contact email is required for Grid business verification")
  }
  // Grid uses customer.email as the primary contact for hosted KYB/SumSub (org owner).
  payload.email = email

  // Omit address on initial create: Grid treats address.state as an ISO country code
  // (e.g. CA → Canada) even when address.country is US. SumSub collects address in hosted KYB.

  return payload
}
