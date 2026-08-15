import { countries } from "@/lib/countries"
import { getKybFields, kybFieldValue } from "@/lib/kyb-by-country"
import type { BusinessProfile } from "@/lib/use-business-profile"
import { isOperationalAddressComplete } from "@easner/shared/postal-address-form"

function getCountryFromCode(code: string) {
  return countries.find((c) => c.code === code)
}

function nonEmpty(s: string | null | undefined): boolean {
  return Boolean(String(s ?? "").trim())
}

function countryCodeFromProfile(profile: {
  countryCode?: string | null
  country?: string | null
}): string {
  const fromApi = profile.countryCode?.trim().toUpperCase()
  if (fromApi && getCountryFromCode(fromApi)) return fromApi
  const stored = profile.country?.trim()
  if (stored) {
    if (/^[A-Za-z]{2}$/.test(stored)) {
      const iso = stored.toUpperCase()
      if (getCountryFromCode(iso)) return iso
    }
    const m = countries.find((c) => c.name.toLowerCase() === stored.toLowerCase())
    if (m) return m.code
  }
  return ""
}

export function countryCodeFromProfileForKyb(
  profile: Pick<
    BusinessProfile,
    "registrationCountryCode" | "registrationCountry" | "countryCode" | "country"
  >,
): string {
  const fromRegistration = countryCodeFromProfile({
    countryCode: profile.registrationCountryCode,
    country: profile.registrationCountry,
  })
  if (fromRegistration) return fromRegistration
  return countryCodeFromProfile({
    countryCode: profile.countryCode,
    country: profile.country,
  })
}

/**
 * True when Business settings tab persisted fields are filled (legal IDs per country, address, public contact).
 * Pair with `onboardingComplete` for checklist step 1.
 */
export function isBusinessTabComplete(profile: BusinessProfile): boolean {
  if (!nonEmpty(profile.name)) return false
  if (!nonEmpty(profile.businessType)) return false
  if (!nonEmpty(profile.baseCurrency)) return false
  if (!nonEmpty(profile.description)) return false

  const code = countryCodeFromProfileForKyb(profile)
  if (!code) return false

  for (const f of getKybFields(code)) {
    if (!nonEmpty(kybFieldValue(f.id, profile))) return false
  }

  if (!nonEmpty(profile.addressLine1)) return false
  if (!nonEmpty(profile.city)) return false

  const addressParts = {
    line1: profile.addressLine1,
    city: profile.city,
    state: profile.state,
    postalCode: profile.postalCode,
    countryCode: countryCodeFromProfile({
      countryCode: profile.countryCode,
      country: profile.country,
    }),
  }
  if (!isOperationalAddressComplete(addressParts.countryCode ?? code, addressParts)) return false

  if (!nonEmpty(profile.website)) return false
  if (!nonEmpty(profile.supportEmail)) return false
  if (!nonEmpty(profile.supportPhone)) return false

  return true
}

export function isBusinessInfoStepComplete(profile: BusinessProfile): boolean {
  return Boolean(profile.onboardingComplete && isBusinessTabComplete(profile))
}
