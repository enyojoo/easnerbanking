import { FLAG_ISO_SET } from './flag-iso-codes'

/** Normalize ISO 3166-1 alpha-2 for flag lookup. */
export function normalizeFlagIso(code: string): string {
  return String(code || '').trim().toUpperCase()
}

export function hasFlagAsset(iso: string): boolean {
  const upper = normalizeFlagIso(iso)
  return upper.length === 2 && FLAG_ISO_SET.has(upper)
}

/** Public URL path for Next/static web (files in /public/flags). */
export function getFlagPublicUrl(iso: string): string | undefined {
  const upper = normalizeFlagIso(iso)
  if (!hasFlagAsset(upper)) return undefined
  return `/flags/${upper.toLowerCase()}.png`
}

import { getCountryCodeForCurrency } from './currency-mapping'

/**
 * ISO for currency flag display.
 * EUR uses bundled `eu.png` (EU emblem), not a single member state — see flagIsoForCurrency in sync list.
 */
export function flagIsoForCurrency(currency: string): string {
  const code = String(currency || '').trim().toUpperCase()
  if (code === 'EUR') return 'EU'
  return getCountryCodeForCurrency(code) || ''
}
