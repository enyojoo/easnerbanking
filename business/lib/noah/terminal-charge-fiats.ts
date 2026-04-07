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
