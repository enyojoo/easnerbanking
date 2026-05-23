import type { SupabaseClient } from "@supabase/supabase-js"
import type { ExchangeRate } from "@easner/shared"
import {
  buildManualSendPayInCurrencies,
  groupManualPayInOptionsByCurrency,
  type ManualPayInPaymentMethodRow,
} from "@easner/shared"

export async function loadManualSendCatalog(admin: SupabaseClient) {
  const [{ data: rateRows, error: rateErr }, { data: pmRows, error: pmErr }] = await Promise.all([
    admin.from("exchange_rates").select("*").eq("status", "active"),
    admin.from("payment_methods").select("id,currency,name,type,is_default,status").eq("status", "active"),
  ])

  if (rateErr) throw new Error(rateErr.message)
  if (pmErr) throw new Error(pmErr.message)

  const exchangeRates = (rateRows ?? []) as ExchangeRate[]
  const paymentMethods = (pmRows ?? []) as ManualPayInPaymentMethodRow[]

  const sendCurrencies = buildManualSendPayInCurrencies({ exchangeRates, paymentMethods })
  const paymentMethodsByCurrency = groupManualPayInOptionsByCurrency(paymentMethods)

  return {
    sendCurrencies,
    exchangeRates,
    paymentMethodsByCurrency,
  }
}
