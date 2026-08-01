import { countries, displayCountryFromBusinessSetting } from "@/lib/countries"
import type { GridBusinessProfile } from "./business-kyc-metadata"

/** Resolve businesses.country (ISO-2 or display name) to ISO-2 when possible. */
export function resolveBusinessCountryIso2(stored: string | null | undefined): string | null {
  const raw = String(stored ?? "").trim()
  if (!raw) return null
  if (/^[A-Za-z]{2}$/.test(raw)) return raw.toUpperCase()
  const display = displayCountryFromBusinessSetting(raw)
  const found = countries.find((c) => c.name.toLowerCase() === display.trim().toLowerCase())
  return found?.code ?? null
}

export function defaultGridBusinessLegalName(input: {
  name?: string | null
  easetag?: string | null
}): string {
  const name = String(input.name ?? "").trim()
  if (name) return name
  const tag = String(input.easetag ?? "").trim()
  if (tag) return tag
  return "Easner Business"
}

/** Merge optional Easner org fields into a profile shell for hosted KYB (never blocks start). */
export function buildGridBusinessProfileShell(input: {
  name?: string | null
  easetag?: string | null
  registrationNumber?: string | null
  taxId?: string | null
  country?: string | null
  addressLine1?: string | null
  city?: string | null
  state?: string | null
  postalCode?: string | null
  email?: string | null
  createdAt?: string | null
}): GridBusinessProfile {
  const countryIso2 = resolveBusinessCountryIso2(input.country)
  return {
    legalName: defaultGridBusinessLegalName(input),
    registrationNumber: input.registrationNumber,
    taxId: input.taxId,
    country: countryIso2 ?? input.country,
    addressLine1: input.addressLine1,
    city: input.city,
    state: input.state,
    postalCode: input.postalCode,
    email: input.email,
    createdAt: input.createdAt,
  }
}
