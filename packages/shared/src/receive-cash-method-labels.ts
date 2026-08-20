/** Subtitles for receive cash deposit method rows. */
export const RECEIVE_CASH_MOMO_SUBTITLE = "Deposit via MOMO Transfer"

function depositCreditSubtitle(depositCurrency: string, creditCurrency: string): string {
  const deposit = String(depositCurrency ?? "").trim().toUpperCase()
  const credit = String(creditCurrency ?? "").trim().toUpperCase()
  return `Deposit ${deposit} to credit your ${credit} Balance`
}

/** US / EU bank transfer row (Noah VA) – deposit and credit use the same account currency. */
export function receiveInternationalDepositSubtitle(accountCurrency: string): string {
  const cur = String(accountCurrency ?? "").trim().toUpperCase()
  return depositCreditSubtitle(cur, cur)
}

/** Local pay-in row (YC fund balance) – pay in local currency, credit USD balance. */
export function receiveLocalDepositSubtitle(localPayInCurrency: string): string {
  const cur = String(localPayInCurrency ?? "").trim().toUpperCase()
  return depositCreditSubtitle(cur, "USD")
}

/** @deprecated Use receiveInternationalDepositSubtitle("USD") */
export const RECEIVE_CASH_BANK_SUBTITLE = receiveInternationalDepositSubtitle("USD")

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
  return `${countryName} MOMO Transfer`
}

/** Send → Through Local Currency pay-in rows (YC cross-border). */
export function sendLocalPayInBankTitle(countryName: string): string {
  return `${countryName} Bank Transfer`
}

export function sendLocalPayInMomoTitle(countryName: string): string {
  return `${countryName} MOMO Transfer`
}

/** Selected send-source chip (country flag shown separately). */
export const SEND_LOCAL_PAY_IN_BANK_CHIP = "Bank Transfer"
export const SEND_LOCAL_PAY_IN_MOMO_CHIP = "MOMO Transfer"
