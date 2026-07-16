/** Subtitles for receive cash deposit method rows. */
export const RECEIVE_CASH_BANK_SUBTITLE = "Deposit via Bank Transfer"
export const RECEIVE_CASH_MOMO_SUBTITLE = "Deposit via Mobile Money Transfer"

/** ISO-2 → display name for local receive corridors (and common fallbacks). */
const LOCAL_RECEIVE_COUNTRY_NAMES: Record<string, string> = {
  NG: "Nigeria",
  KE: "Kenya",
  GH: "Ghana",
  ZA: "South Africa",
  UG: "Uganda",
  TZ: "Tanzania",
  MX: "Mexico",
  BR: "Brazil",
  AR: "Argentina",
  CO: "Colombia",
  CL: "Chile",
  RW: "Rwanda",
  US: "United States",
  GB: "United Kingdom",
}

export function resolveReceiveCountryName(countryCode: string): string {
  const cc = String(countryCode ?? "").trim().toUpperCase()
  return LOCAL_RECEIVE_COUNTRY_NAMES[cc] ?? cc
}

export function receiveInternationalBankTitle(currency: "USD" | "EUR"): string {
  return currency === "USD" ? "US Bank Account" : "EU Bank Account"
}

export function receiveLocalBankTitle(countryName: string): string {
  return `${countryName} Bank Account`
}

export function receiveLocalMomoTitle(countryName: string): string {
  return `${countryName} Mobile Money`
}
