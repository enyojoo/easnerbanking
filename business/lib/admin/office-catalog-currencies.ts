import { isReportingFxCurrencyCode } from "@/lib/fx/reporting-fx"

/** Asset codes managed on Platform control → Crypto (automated wallet send). */
export const CRYPTO_ASSET_CODES = new Set(["USDC", "USDT", "BTC", "EURC", "SOL", "PYUSD"])

export function isFiatCurrencyCode(code: string): boolean {
  const upper = code.trim().toUpperCase()
  return /^[A-Z]{3}$/.test(upper) && !CRYPTO_ASSET_CODES.has(upper)
}

/** @deprecated Use isReportingFxCurrencyCode from @/lib/fx/reporting-fx */
export function isOfficeP2pRatesCurrencyCode(code: string): boolean {
  return isReportingFxCurrencyCode(code)
}

type CurrencyRow = { code: string; can_send?: boolean | null; status?: string | null }

/** Currencies shown on Office → Reporting FX. */
export function filterOfficeReportingFxCurrencies<T extends CurrencyRow>(rows: T[]): T[] {
  return rows.filter((c) => isReportingFxCurrencyCode(String(c.code ?? "")))
}

/** @deprecated Alias for filterOfficeReportingFxCurrencies */
export function filterOfficeRatesCurrencies<T extends CurrencyRow>(rows: T[]): T[] {
  return filterOfficeReportingFxCurrencies(rows)
}

/** All ISO-like fiat codes (Platform settings, payout corridors, etc.). */
export function filterOfficeFiatCurrencies<T extends CurrencyRow>(rows: T[]): T[] {
  return rows.filter((c) => isFiatCurrencyCode(String(c.code ?? "")))
}
