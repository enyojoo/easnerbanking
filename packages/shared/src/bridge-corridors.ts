import { GRID_EUR_SEPA_COUNTRY_CODES } from "./yc-recipient-schema"
import type { PayoutProviderId } from "./payout-corridor"

/** Bridge bank payout destinations (Turnkey USDC/EURC → local rail). No momo. */
const BRIDGE_BANK_PAYOUT: ReadonlyArray<{ country: string; currency: string }> = [
  { country: "US", currency: "USD" },
  { country: "GB", currency: "GBP" },
  { country: "MX", currency: "MXN" },
  { country: "BR", currency: "BRL" },
  { country: "CO", currency: "COP" },
]

function normIso2(value: string | null | undefined): string {
  return String(value ?? "").trim().toUpperCase()
}

function normState(value: string | null | undefined): string {
  return String(value ?? "").trim().toUpperCase()
}

const BRIDGE_PROHIBITED_ISO2 = new Set([
  "AF",
  "BY",
  "CU",
  "IR",
  "IQ",
  "KP",
  "LY",
  "MM",
  "RU",
  "SO",
  "SS",
  "SD",
  "SY",
  "VE",
  "YE",
  "ZW",
])

export function isBridgeNewYorkResidence(input: {
  countryCode?: string | null
  state?: string | null
}): boolean {
  if (normIso2(input.countryCode) !== "US") return false
  const state = normState(input.state)
  return state === "NY" || state === "NEW YORK"
}

/** True when this person can start Bridge KYC (not NY, not a prohibited country). */
export function isBridgeOnboardableResidence(input: {
  countryCode?: string | null
  state?: string | null
}): boolean {
  const cc = normIso2(input.countryCode)
  if (!cc || !/^[A-Z]{2}$/.test(cc)) return false
  if (BRIDGE_PROHIBITED_ISO2.has(cc)) return false
  if (isBridgeNewYorkResidence(input)) return false
  return true
}

function norm(value: string | null | undefined): string {
  return normIso2(value)
}

export function isBridgeEurSepaCorridor(countryCode: string, currencyCode: string): boolean {
  return norm(currencyCode) === "EUR" && GRID_EUR_SEPA_COUNTRY_CODES.has(norm(countryCode))
}

export function isBridgeUsdPayInCorridor(countryCode: string, currencyCode: string): boolean {
  return norm(countryCode) === "US" && norm(currencyCode) === "USD"
}

/** Bridge issues USD + EUR virtual accounts only. */
export function bridgeOffersBankPayIn(
  countryCode: string,
  currencyCode: string,
  rail?: string,
): boolean {
  if (rail === "mobile_money") return false
  return isBridgeUsdPayInCorridor(countryCode, currencyCode) || isBridgeEurSepaCorridor(countryCode, currencyCode)
}

/** Bridge offramp bank corridors Office can route payout to. */
export function bridgeOffersBankPayout(
  countryCode: string,
  currencyCode: string,
  rail?: string,
): boolean {
  if (rail === "mobile_money") return false
  const cc = norm(countryCode)
  const cur = norm(currencyCode)
  if (isBridgeEurSepaCorridor(cc, cur)) return true
  return BRIDGE_BANK_PAYOUT.some((row) => row.country === cc && row.currency === cur)
}

/** EUR Bridge payouts settle Turnkey EURC; everything else stays USDC. */
export function settlementAssetForPayoutProvider(
  provider: PayoutProviderId | string | null | undefined,
  currencyCode?: string | null,
): string {
  if (String(provider ?? "").trim().toLowerCase() === "bridge" && norm(currencyCode) === "EUR") {
    return "EURC"
  }
  return "USDC"
}
