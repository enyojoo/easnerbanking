import type { TransactionWithSource } from "@/lib/transactions"

/** True when any row was recorded under a different org base currency than the current one. */
export function hasHistoricalBaseCurrencyMismatch(
  transactions: TransactionWithSource[],
  currentBaseCurrency: string,
): boolean {
  const current = currentBaseCurrency.trim().toUpperCase()
  if (!current) return false
  return transactions.some((t) => {
    const stored = String(t.baseCurrency ?? "").trim().toUpperCase()
    return stored.length > 0 && stored !== current
  })
}

export const REPORTING_FX_BASE_CHANGE_NOTE =
  "Some activity was recorded under a previous base currency. Totals use reporting FX where stored base amounts are unavailable."
