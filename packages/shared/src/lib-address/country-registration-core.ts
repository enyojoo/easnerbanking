import { registerCountry } from "./runtime"

export function createOperationalAddressCountryRegistry(
  loadCountryData: (code: string) => Promise<unknown>,
) {
  const registered = new Set<string>()
  const pending = new Map<string, Promise<void>>()

  function isOperationalAddressCountryRegistered(countryCode: string): boolean {
    const code = countryCode.trim().toUpperCase()
    return registered.has(code)
  }

  async function ensureOperationalAddressCountryRegistered(countryCode: string): Promise<void> {
    const code = countryCode.trim().toUpperCase()
    if (!/^[A-Z]{2}$/.test(code)) return
    if (registered.has(code)) return

    const inflight = pending.get(code)
    if (inflight) {
      await inflight
      return
    }

    const task = (async () => {
      const data = await loadCountryData(code)
      registerCountry(data as Parameters<typeof registerCountry>[0])
      registered.add(code)
    })()

    pending.set(code, task)
    try {
      await task
    } finally {
      pending.delete(code)
    }
  }

  async function registerOperationalAddressCountries(countryCodes: string[]): Promise<void> {
    const unique = [
      ...new Set(countryCodes.map((c) => c.trim().toUpperCase()).filter((c) => /^[A-Z]{2}$/.test(c))),
    ]
    await Promise.all(unique.map((code) => ensureOperationalAddressCountryRegistered(code)))
  }

  /** Test helper – marks a country as registered without loading JSON. */
  function markOperationalAddressCountryRegisteredForTests(countryCode: string): void {
    registered.add(countryCode.trim().toUpperCase())
  }

  return {
    isOperationalAddressCountryRegistered,
    ensureOperationalAddressCountryRegistered,
    registerOperationalAddressCountries,
    markOperationalAddressCountryRegisteredForTests,
  }
}
