/** Asset codes managed on Platform control → Crypto (automated wallet send). */
export const CRYPTO_ASSET_CODES = new Set(["USDC", "USDT", "BTC", "EURC", "SOL", "PYUSD"])

/** Stablecoins configurable on Rates + Payment methods for manual “Through another currency”. */
export const MANUAL_PAYIN_ASSET_CODES = new Set(["USDC", "USDT"])

export function isFiatCurrencyCode(code: string): boolean {
  const upper = code.trim().toUpperCase()
  return /^[A-Z]{3}$/.test(upper) && !CRYPTO_ASSET_CODES.has(upper)
}

export function isManualPayInCurrencyCode(code: string): boolean {
  const upper = code.trim().toUpperCase()
  return MANUAL_PAYIN_ASSET_CODES.has(upper)
}

/** Fiat or manual pay-in stablecoin (USDC/USDT) — eligible for Office Rates + manual PM. */
export function isOfficeManualRatesCurrencyCode(code: string): boolean {
  const upper = code.trim().toUpperCase()
  if (isManualPayInCurrencyCode(upper)) return true
  return isFiatCurrencyCode(upper)
}

type CurrencyRow = { code: string; can_send?: boolean | null; status?: string | null }

/**
 * Currencies eligible for Office rates / payment-method configuration:
 * ISO-like fiat plus USDC/USDT for manual pay-in.
 */
export function filterOfficeRatesCurrencies<T extends CurrencyRow>(
  rows: T[],
  opts?: { paymentMethodCodes?: Set<string> },
): T[] {
  const pm = opts?.paymentMethodCodes
  return rows.filter((c) => {
    const code = String(c.code ?? "").toUpperCase()
    if (!isOfficeManualRatesCurrencyCode(code)) return false
    if (pm && pm.size > 0) {
      return pm.has(code) || c.can_send === true
    }
    return true
  })
}

/** @deprecated Use filterOfficeRatesCurrencies — alias for fiat-only callers. */
export function filterOfficeFiatCurrencies<T extends CurrencyRow>(
  rows: T[],
  opts?: { paymentMethodCodes?: Set<string> },
): T[] {
  return filterOfficeRatesCurrencies(rows, opts).filter((c) =>
    isFiatCurrencyCode(String(c.code ?? "")),
  )
}
