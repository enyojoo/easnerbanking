import { createOperationalAddressCountryRegistry } from "./country-registration-core"

function unwrapCountryJson(mod: { default?: unknown } | unknown): unknown {
  return (mod as { default?: unknown }).default ?? mod
}

/**
 * Metro cannot follow `import(\`…/${code}.json\`)`. Bundle the payout countries
 * that collect holder address (US bank, CAD, ZA) as static imports.
 */
async function loadMetroCountryJson(code: string): Promise<unknown> {
  switch (code) {
    case "US":
      return unwrapCountryJson(await import("lib-address/countries/US.json"))
    case "CA":
      return unwrapCountryJson(await import("lib-address/countries/CA.json"))
    case "ZA":
      return unwrapCountryJson(await import("lib-address/countries/ZA.json"))
    default:
      throw new Error(`No bundled address metadata for ${code}`)
  }
}

export const {
  isOperationalAddressCountryRegistered,
  ensureOperationalAddressCountryRegistered,
  registerOperationalAddressCountries,
  markOperationalAddressCountryRegisteredForTests,
} = createOperationalAddressCountryRegistry(loadMetroCountryJson)
