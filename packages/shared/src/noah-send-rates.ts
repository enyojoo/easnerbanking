import type { ExchangeRate } from "./types"
import { referenceConversionRate } from "./send-flow-reference-rates"

export type NoahWalletRateRow = {
  from_currency: string
  to_currency: string
  rate: number
  as_of?: string
  noah_mid?: number
  country_code?: string | null
}

/** Default TTL for background Noah rate sync (not send gating). */
export const NOAH_SEND_RATES_STALE_MS = 300_000

/** Query path for Noah wallet send preview (business + mobile). */
export function noahSendRatesQueryPath(receiveCurrency: string): string {
  const dest = receiveCurrency.trim().toUpperCase()
  if (!dest || dest.length !== 3) return "/api/fx/noah-rates"
  return `/api/fx/noah-rates?destinations=${encodeURIComponent(dest)}`
}

/** True when a DB row has a usable customer rate (ignores age — sync/ops owns freshness). */
export function hasNoahSendRateRow(
  row: Pick<NoahWalletRateRow, "rate"> | null | undefined,
): boolean {
  return Boolean(row && Number.isFinite(row.rate) && row.rate > 0)
}

/** True when an active DB rate exists and is within TTL (background sync only). */
export function isNoahSendRateRowFresh(
  row: Pick<NoahWalletRateRow, "rate" | "as_of" | "from_currency" | "to_currency"> | null | undefined,
  maxAgeMs = NOAH_SEND_RATES_STALE_MS,
): boolean {
  if (!hasNoahSendRateRow(row)) return false
  const asOf = row!.as_of ? new Date(row!.as_of).getTime() : NaN
  if (!Number.isFinite(asOf) || asOf <= 0) return false
  return Date.now() - asOf <= maxAgeMs
}

/** Match Noah sell/prepare FiatAmount formatting (2 decimal places). */
export function normalizePayoutReceiveAmount(amount: number): number {
  if (!Number.isFinite(amount) || amount <= 0) return 0
  return Math.round(amount * 100) / 100
}

/**
 * Noah BankLocal / mobile corridors (e.g. NGN, IDR) reject fractional destination fiat.
 * Round to whole units before prepare and when comparing stash freshness.
 */
export const ZERO_DECIMAL_PAYOUT_CURRENCIES = new Set([
  "NGN",
  "KES",
  "GHS",
  "UGX",
  "RWF",
  "XOF",
  "XAF",
  "IDR",
])

export function isZeroDecimalPayoutCurrency(currency: string): boolean {
  return ZERO_DECIMAL_PAYOUT_CURRENCIES.has(currency.trim().toUpperCase())
}

export function normalizePayoutReceiveAmountForCurrency(
  currency: string,
  amount: number,
): number {
  const normalized = normalizePayoutReceiveAmount(amount)
  if (!Number.isFinite(normalized) || normalized <= 0) return 0
  if (isZeroDecimalPayoutCurrency(currency)) {
    return Math.round(normalized)
  }
  return normalized
}

/** Noah sell/prepare FiatAmount string — whole units for zero-decimal fiats. */
export function formatPayoutFiatAmountForPrepare(currency: string, amount: number): string {
  const normalized = normalizePayoutReceiveAmountForCurrency(currency, amount)
  if (!Number.isFinite(normalized) || normalized <= 0) return "0"
  if (isZeroDecimalPayoutCurrency(currency)) {
    return String(Math.round(normalized))
  }
  return normalized.toFixed(2)
}

/** Match wallet balance / send-side display precision. */
export function normalizePayoutSendAmount(amount: number): number {
  if (!Number.isFinite(amount) || amount <= 0) return 0
  return Math.round(amount * 100) / 100
}

/** Compare receive amounts after corridor-aware normalization. */
export function payoutReceiveAmountsMatchForCurrency(
  a: number,
  b: number,
  currency: string,
): boolean {
  return (
    normalizePayoutReceiveAmountForCurrency(currency, a) ===
    normalizePayoutReceiveAmountForCurrency(currency, b)
  )
}

/** Compare receive amounts after Noah prepare normalization. */
export function payoutReceiveAmountsMatch(a: number, b: number): boolean {
  return normalizePayoutReceiveAmount(a) === normalizePayoutReceiveAmount(b)
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

/**
 * Bidirectional send preview using one forward rate: 1 send = forwardRate × receive.
 * - User enters receive → send = receive / forwardRate
 * - User enters send → receive = send × forwardRate
 */
export function convertNoahSendFlowAmounts(input: {
  direction: "receive" | "send"
  amount: number
  sendCurrency: string
  receiveCurrency: string
  rateMap: Record<string, number>
}): { sendAmount: number; receiveAmount: number; forwardRate: number } {
  const { direction, amount, sendCurrency, receiveCurrency, rateMap } = input
  const send = sendCurrency.trim().toUpperCase()
  const receive = receiveCurrency.trim().toUpperCase()

  if (amount <= 0) {
    return { sendAmount: 0, receiveAmount: 0, forwardRate: 1 }
  }
  if (send === receive) {
    const normalized = normalizePayoutReceiveAmountForCurrency(receive, amount)
    return { sendAmount: normalized, receiveAmount: normalized, forwardRate: 1 }
  }

  const forwardRate = getNoahSendConversionRate(rateMap, send, receive)
  if (direction === "receive") {
    const receiveAmount = normalizePayoutReceiveAmountForCurrency(receive, amount)
    const sendAmount =
      forwardRate > 0
        ? normalizePayoutSendAmount(receiveAmount / forwardRate)
        : 0
    return { sendAmount, receiveAmount, forwardRate }
  }
  const sendAmount = normalizePayoutSendAmount(amount)
  const receiveAmount =
    forwardRate > 0
      ? normalizePayoutReceiveAmountForCurrency(receive, sendAmount * forwardRate)
      : 0
  return { sendAmount, receiveAmount, forwardRate }
}

/** Build rate map from `ExchangeRate[]` rows (e.g. mobile Noah hook). */
export function exchangeRatesToRateMap(
  rates: Array<{ from_currency: string; to_currency: string; rate: number; status?: string }>,
): Record<string, number> {
  const map: Record<string, number> = {}
  for (const r of rates) {
    if (r.status && r.status !== "active") continue
    if (!Number.isFinite(r.rate) || r.rate <= 0) continue
    const from = String(r.from_currency || "").toUpperCase()
    const to = String(r.to_currency || "").toUpperCase()
    map[`${from}_${to}`] = r.rate
  }
  return map
}
