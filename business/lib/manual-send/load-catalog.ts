import type { SupabaseClient } from "@supabase/supabase-js"
import type { ExchangeRate } from "@easner/shared"
import {
  buildManualSendPayInCurrencies,
  buildManualSendPayInCurrencyOptions,
  groupManualPayInOptionsByCurrency,
  type ManualPayInPaymentMethodRow,
} from "@easner/shared"

export async function loadManualSendCatalog(admin: SupabaseClient) {
  const [{ data: rateRows, error: rateErr }, { data: pmRows, error: pmErr }, { data: currencyRows, error: curErr }] =
    await Promise.all([
      admin.from("exchange_rates").select("*").eq("status", "active"),
      admin
        .from("payment_methods")
        .select("id,currency,name,type,is_default,status,display_logo_url")
        .eq("status", "active"),
      admin.from("currencies").select("code,name,symbol").eq("status", "active"),
    ])

  if (rateErr) throw new Error(rateErr.message)
  if (pmErr) throw new Error(pmErr.message)
  if (curErr) throw new Error(curErr.message)

  const exchangeRates = (rateRows ?? []) as ExchangeRate[]
  const paymentMethods = (pmRows ?? []) as ManualPayInPaymentMethodRow[]

  const sendCurrencies = buildManualSendPayInCurrencies({ exchangeRates, paymentMethods })
  const sendCurrencyOptions = buildManualSendPayInCurrencyOptions(
    sendCurrencies,
    (currencyRows ?? []).map((r) => ({
      code: String(r.code),
      name: String(r.name),
      symbol: r.symbol != null ? String(r.symbol) : null,
    })),
  )
  const paymentMethodsByCurrency = groupManualPayInOptionsByCurrency(paymentMethods)

  return {
    sendCurrencies,
    sendCurrencyOptions,
    exchangeRates,
    paymentMethodsByCurrency,
  }
}
