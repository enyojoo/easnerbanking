import type { PayoutCorridorPublic } from "./payout-corridor"
import type { SendDestinationsResponse } from "./send-destinations"
import { getCurrencySymbol } from "./currency-symbol"

/** Fiat currencies users can hold on balance accounts (not "through another currency"). */
export const BALANCE_HOLD_CURRENCY_CODES = ["USD", "EUR", "GBP", "NGN"] as const

export type OtherSendCurrency = {
  code: string
  name: string
  symbol: string
}

export type CrossBorderPaymentMethod = {
  code: string
  name: string
}

function distinctCorridors(catalog: SendDestinationsResponse): PayoutCorridorPublic[] {
  const seen = new Set<string>()
  const out: PayoutCorridorPublic[] = []
  for (const row of [...catalog.fiat.bank_transfer, ...catalog.fiat.mobile_money]) {
    const key = `${row.country_code}:${row.currency_code}:${row.rail}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push(row)
  }
  return out
}

/** Cross-border send currencies from enabled fiat corridors (excludes balance-hold fiats). */
export function buildOtherSendCurrencies(catalog: SendDestinationsResponse): OtherSendCurrency[] {
  const hold = new Set(BALANCE_HOLD_CURRENCY_CODES.map((c) => c.toUpperCase()))
  const byCode = new Map<string, OtherSendCurrency>()
  for (const row of distinctCorridors(catalog)) {
    const code = row.currency_code.toUpperCase()
    if (hold.has(code)) continue
    if (!byCode.has(code)) {
      byCode.set(code, {
        code,
        name: row.currency_name,
        symbol: getCurrencySymbol(code, code),
      })
    }
  }
  return [...byCode.values()].sort((a, b) => a.name.localeCompare(b.name))
}

function mobileMethodCode(currencyCode: string, providers: unknown): string {
  const list = Array.isArray(providers) ? providers.map((p) => String(p).toLowerCase()) : []
  if (currencyCode === "GHS" || list.some((p) => p.includes("mtn"))) return "mtnMomo"
  if (currencyCode === "KES" || list.some((p) => p.includes("m-pesa") || p.includes("mpesa"))) return "mpesa"
  return "mobileMoney"
}

function mobileMethodName(code: string): string {
  if (code === "mtnMomo") return "MTN MOMO"
  if (code === "mpesa") return "M-Pesa"
  return "Mobile Money"
}

/** Payment rails available per cross-border fiat currency from corridor catalog. */
export function buildCrossBorderPaymentMethods(
  catalog: SendDestinationsResponse,
): Record<string, CrossBorderPaymentMethod[]> {
  const methods = new Map<string, Map<string, CrossBorderPaymentMethod>>()

  const add = (currencyCode: string, method: CrossBorderPaymentMethod) => {
    const code = currencyCode.toUpperCase()
    const bucket = methods.get(code) ?? new Map<string, CrossBorderPaymentMethod>()
    bucket.set(method.code, method)
    methods.set(code, bucket)
  }

  for (const row of catalog.fiat.bank_transfer) {
    add(row.currency_code, { code: "bankTransfer", name: "Bank Transfer" })
  }
  for (const row of catalog.fiat.mobile_money) {
    const cur = row.currency_code.toUpperCase()
    const mCode = mobileMethodCode(cur, row.providers)
    add(cur, { code: mCode, name: mobileMethodName(mCode) })
  }

  const out: Record<string, CrossBorderPaymentMethod[]> = {}
  for (const [cur, bucket] of methods) {
    out[cur] = [...bucket.values()]
  }
  return out
}
