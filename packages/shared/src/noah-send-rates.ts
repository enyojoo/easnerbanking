import type { ExchangeRate } from "./types"
import { referenceConversionRate } from "./send-flow-reference-rates"

export type NoahWalletRateRow = {
  from_currency: string
  to_currency: string
  rate: number
  as_of?: string
}

/** Query path for Noah wallet send preview (business + mobile). */
export function noahSendRatesQueryPath(receiveCurrency: string): string {
  const dest = receiveCurrency.trim().toUpperCase()
  if (!dest || dest.length !== 3) return "/api/noah/exchange-rates"
  return `/api/noah/exchange-rates?destinations=${encodeURIComponent(dest)}`
}

/** Build `from_to` rate map from Noah batch rows. */
export function noahWalletRowsToRateMap(
  rows: NoahWalletRateRow[],
): Record<string, number> {
  const map: Record<string, number> = {}
  for (const row of rows) {
    const from = String(row.from_currency || "").toUpperCase()
    const to = String(row.to_currency || "").toUpperCase()
    if (from && to && Number.isFinite(row.rate) && row.rate > 0) {
      map[`${from}_${to}`] = row.rate
    }
  }
  return map
}

export function mapNoahWalletRateRows(
  rows: NoahWalletRateRow[],
  fallbackTs = new Date().toISOString(),
): ExchangeRate[] {
  return rows
    .filter((r) => Number.isFinite(r.rate) && r.rate > 0)
    .map((r) => {
      const from = r.from_currency.toUpperCase()
      const to = r.to_currency.toUpperCase()
      const at = r.as_of ?? fallbackTs
      return {
        id: `noah-${from}-${to}`.toLowerCase(),
        from_currency: from,
        to_currency: to,
        rate: r.rate,
        fee_type: "free" as const,
        fee_amount: 0,
        status: "active",
        created_at: at,
        updated_at: at,
      }
    })
}

/**
 * Lookup rate for send preview: Noah map key first, then static USD-hub reference.
 */
export function getNoahSendConversionRate(
  rateMap: Record<string, number>,
  fromCurrency: string,
  toCurrency: string,
): number {
  const from = fromCurrency.trim().toUpperCase()
  const to = toCurrency.trim().toUpperCase()
  if (from === to) return 1
  const key = `${from}_${to}`
  const noah = rateMap[key]
  if (noah && noah > 0) return noah
  return referenceConversionRate(from, to)
}
