import { countries } from "@/lib/countries"
import { filterCountriesForProductPicker } from "@easner/shared"
import {
  ensureOperationalAddressCountryRegistered,
  registerOperationalAddressCountries,
} from "@easner/shared/postal-address-form"

const businessCountryCodes = filterCountriesForProductPicker(countries, "business").map((c) => c.code)

let serverRegistration: Promise<void> | null = null

/** Register all business-allowed countries (server/API validation). */
export function ensureBusinessOperationalAddressCountriesRegistered(): Promise<void> {
  if (!serverRegistration) {
    serverRegistration = registerOperationalAddressCountries(businessCountryCodes)
  }
  return serverRegistration
}

/** Lazy register when the user picks a country in Settings (browser). */
export async function ensureBusinessOperationalAddressCountryRegistered(countryCode: string): Promise<void> {
  await ensureOperationalAddressCountryRegistered(countryCode)
}

export { businessCountryCodes }
