import type { ExchangeRate } from "./types"
import { currencyDisplayName } from "./currencies/catalog"
import { getCurrencySymbol } from "./currency-symbol"

export type ManualSendCurrencyOption = {
  code: string
  name: string
  symbol: string
}

export type CurrencyNameRow = {
  code: string
  name: string
  symbol?: string | null
}

export type ManualPayInPaymentMethodOption = {
  id: string
  currency: string
  name: string
  type: string
  is_default: boolean
  /** Public image URL from Office → Payment methods → Display logo. */
  display_logo_url?: string | null
}

export type ManualPayInPaymentMethodRow = ManualPayInPaymentMethodOption & {
  status?: string | null
  display_logo_url?: string | null
}

export type ManualPayInScreenRoute =
  | "bank"
  | "mobile_money"
  | "open_banking"
  | "stablecoin"
  | "qr"

function norm(code: string): string {
  return code.trim().toUpperCase()
}

function isActivePm(row: ManualPayInPaymentMethodRow): boolean {
  const st = String(row.status ?? "active").toLowerCase()
  return st === "active"
}

/** Distinct send/pay-in currencies: active rate from_currency ∩ ≥1 active payment method. */
export function buildManualSendPayInCurrencies(input: {
  exchangeRates: ExchangeRate[]
  paymentMethods: ManualPayInPaymentMethodRow[]
}): string[] {
  const { exchangeRates, paymentMethods } = input
  const pmCurrencies = new Set(
    paymentMethods.filter(isActivePm).map((pm) => norm(pm.currency)),
  )
  const fromRates = new Set(
    exchangeRates
      .filter((r) => r.status === "active")
      .map((r) => norm(r.from_currency)),
  )
  const codes: string[] = []
  for (const code of fromRates) {
    if (pmCurrencies.has(code)) codes.push(code)
  }
  return codes.sort()
}

/** Pay-in currency picker rows (full name + symbol) for manual “Through another currency”. */
export function buildManualSendPayInCurrencyOptions(
  codes: string[],
  catalog: CurrencyNameRow[],
): ManualSendCurrencyOption[] {
  const byCode = new Map(catalog.map((row) => [norm(row.code), row]))
  return codes
    .map((raw) => {
      const code = norm(raw)
      const row = byCode.get(code)
      const name = row?.name?.trim() || currencyDisplayName(code)
      const symbol = row?.symbol?.trim() || getCurrencySymbol(code, code)
      return { code, name, symbol }
    })
    .sort((a, b) => a.name.localeCompare(b.name))
}

/** All active payment methods for a send currency (default first, then name). */
export function listManualPayInOptionsForCurrency(
  paymentMethods: ManualPayInPaymentMethodRow[],
  sendCurrency: string,
): ManualPayInPaymentMethodOption[] {
  const cur = norm(sendCurrency)
  return paymentMethods
    .filter((pm) => isActivePm(pm) && norm(pm.currency) === cur)
    .map(({ id, currency, name, type, is_default, display_logo_url }) => ({
      id,
      currency: norm(currency),
      name,
      type,
      is_default: Boolean(is_default),
      display_logo_url:
        typeof display_logo_url === "string" && display_logo_url.trim()
          ? display_logo_url.trim()
          : null,
    }))
    .sort((a, b) => {
      if (a.is_default !== b.is_default) return a.is_default ? -1 : 1
      return a.name.localeCompare(b.name)
    })
}

export function pickDefaultManualPayInOption(
  options: ManualPayInPaymentMethodOption[],
): ManualPayInPaymentMethodOption | null {
  if (options.length === 0) return null
  return options.find((o) => o.is_default) ?? options[0]
}

/** Map payment_methods.type to app pay-in screen route. */
export function routeManualPayInScreen(pmType: string): ManualPayInScreenRoute {
  const t = pmType.trim().toLowerCase()
  switch (t) {
    case "bank_account":
      return "bank"
    case "mobile_money":
      return "mobile_money"
    case "stablecoin":
      return "stablecoin"
    case "qr_code":
      return "qr"
    case "provider":
      return "open_banking"
    default:
      return "bank"
  }
}

/** Group active PM options by currency for catalog API. */
export function groupManualPayInOptionsByCurrency(
  paymentMethods: ManualPayInPaymentMethodRow[],
): Record<string, ManualPayInPaymentMethodOption[]> {
  const byCur = new Map<string, ManualPayInPaymentMethodOption[]>()
  for (const pm of paymentMethods.filter(isActivePm)) {
    const code = norm(pm.currency)
    const list = byCur.get(code) ?? []
    list.push({
      id: pm.id,
      currency: code,
      name: pm.name,
      type: pm.type,
      is_default: Boolean(pm.is_default),
      display_logo_url:
        typeof pm.display_logo_url === "string" && pm.display_logo_url.trim()
          ? pm.display_logo_url.trim()
          : null,
    })
    byCur.set(code, list)
  }
  const out: Record<string, ManualPayInPaymentMethodOption[]> = {}
  for (const [code, list] of byCur) {
    out[code] = list.sort((a, b) => {
      if (a.is_default !== b.is_default) return a.is_default ? -1 : 1
      return a.name.localeCompare(b.name)
    })
  }
  return out
}
