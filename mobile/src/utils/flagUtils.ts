import { currencyToCountryCode, getCountryCodeForCurrency } from '@easner/shared'

export const CURRENCY_FLAG_MAP: { [key: string]: string } = {}

const isoToFlagEmoji = (countryCode: string): string => {
  const upper = countryCode.trim().toUpperCase()
  if (!/^[A-Z]{2}$/.test(upper)) return '🌍'
  const codePoints = upper.split('').map((char) => 0x1f1e6 + (char.charCodeAt(0) - 65))
  return String.fromCodePoint(...codePoints)
}

/**
 * Get the country flag emoji for a given currency code
 * @param currencyCode - The 3-letter currency code (e.g., 'USD', 'NGN')
 * @returns The corresponding flag emoji or a default world emoji
 */
export const getCountryFlag = (currencyCode: string): string => {
  if (!currencyCode) return '🌍'

  const normalizedCode = currencyCode.toUpperCase()
  if (normalizedCode === 'EUR') return '🇪🇺'
  const isoCode = getCountryCodeForCurrency(normalizedCode)
  return isoCode ? isoToFlagEmoji(isoCode) : '🌍'
}

/**
 * Get all available currency codes with their flags
 * @returns Array of objects with currency code and flag
 */
export const getAllCurrencyFlags = (): Array<{ code: string; flag: string }> => {
  return Object.keys(currencyToCountryCode).map((code) => ({
    code,
    flag: getCountryFlag(code),
  }))
}

/**
 * Check if a currency code has a flag mapping
 * @param currencyCode - The currency code to check
 * @returns True if the currency has a flag mapping
 */
export const hasFlagMapping = (currencyCode: string): boolean => {
  const normalizedCode = currencyCode.toUpperCase()
  return normalizedCode === 'EUR' || normalizedCode in currencyToCountryCode
}
