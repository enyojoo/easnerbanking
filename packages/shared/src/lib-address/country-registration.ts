import { createOperationalAddressCountryRegistry } from "./country-registration-core"

async function loadWebpackCountryJson(code: string): Promise<unknown> {
  const mod = await import(
    /* webpackMode: "lazy-once" */
    `../../../../node_modules/lib-address/countries/${code}.json`
  )
  return (mod as { default?: unknown }).default ?? mod
}

export const {
  isOperationalAddressCountryRegistered,
  ensureOperationalAddressCountryRegistered,
  registerOperationalAddressCountries,
  markOperationalAddressCountryRegisteredForTests,
} = createOperationalAddressCountryRegistry(loadWebpackCountryJson)
