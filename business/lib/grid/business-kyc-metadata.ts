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

/** Stable 9-digit shell tax id for Grid create when org has none yet (SumSub collects verified value). */
export function gridShellBusinessTaxId(platformCustomerId: string): string {
  let hash = 0
  for (let i = 0; i < platformCustomerId.length; i++) {
    hash = (Math.imul(31, hash) + platformCustomerId.charCodeAt(i)) | 0
  }
  return String((Math.abs(hash) % 900_000_000) + 100_000_000)
}

function normalizeGridBusinessTaxId(input: {
  taxId?: string | null
  registrationNumber?: string | null
  platformCustomerId: string
}): string {
  for (const raw of [input.taxId, input.registrationNumber]) {
    const digits = digitsOnly(String(raw ?? ""))
    if (digits.length === 9) return digits
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

  businessInfo.taxId = normalizeGridBusinessTaxId({
    taxId: input.profile.taxId,
    registrationNumber: input.profile.registrationNumber,
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
    throw new Error("Contact email is required for Grid business verification")
  }
  payload.email = email

  const line1 = String(input.profile.addressLine1 ?? "").trim()
  const city = String(input.profile.city ?? "").trim()
  if (line1 || city || countryIso2) {
    payload.address = {
      ...(line1 ? { line1 } : {}),
      ...(city ? { city } : {}),
      ...(input.profile.state?.trim() ? { state: input.profile.state.trim() } : {}),
      ...(input.profile.postalCode?.trim()
        ? { postalCode: input.profile.postalCode.trim() }
        : {}),
      ...(countryIso2 ? { country: countryIso2 } : {}),
    }
  }

  return payload
}
