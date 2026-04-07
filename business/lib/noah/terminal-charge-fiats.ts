import { resolveTerminalPayFiatCurrency } from "@/lib/noah/terminal-pay-fiat"

/** Charge / counter ISO codes offered on terminal keypad (display + validation). FX uses Noah where supported. */
export const TERMINAL_CHARGE_FIAT_CODES: string[] = [
  "EUR",
  "GBP",
  "GHS",
  "KES",
  "NGN",
  "RUB",
  "USD",
  "XOF",
  "ZAR",
]

const ALLOWED = new Set(TERMINAL_CHARGE_FIAT_CODES)

export function isTerminalChargeFiatSupported(code: string): boolean {
  return ALLOWED.has(code.trim().toUpperCase())
}

/**
 * Counter denomination for `/pay`: business **base currency** when it is a supported terminal charge
 * code; otherwise the Noah wallet-linked mapping (`resolveTerminalPayFiatCurrency`, typically USD/EUR).
 */
export function resolveTerminalChargeFiatFromBusinessBase(
  baseCurrency: string | null | undefined,
): string {
  const u = (baseCurrency || "").trim().toUpperCase()
  if (u && isTerminalChargeFiatSupported(u)) return u
  return resolveTerminalPayFiatCurrency(baseCurrency)
}
