import type { SupabaseClient } from "@supabase/supabase-js"
import {
  resolvePrimaryPayoutProvider,
  resolveYcPayoutLimits,
  unwrapNoahFieldsSchema,
  validateBalancePayoutAmountForProvider,
  type PayoutRail,
} from "@easner/shared"
import { findYcBalancePayoutRate, listYcRates } from "@/lib/fx/yc-rates"
import { loadCorridorRouting } from "@/lib/payout-providers"
import { findYcSendChannel } from "@/lib/payout-providers/yellowcard-provider"
import { resolveRecipientPayoutCountry } from "@/lib/terminal/recipient-sell-prepare"
import type { RecipientSellPrepareRow } from "@/lib/terminal/recipient-sell-prepare"

export async function validatePayoutQuoteAmountLimits(input: {
  admin: SupabaseClient
  gateRow: RecipientSellPrepareRow
  receiveAmount: number
  sourceBalanceCurrency: string
  amountEntryMode: "send" | "receive"
  sendBudget?: number
}): Promise<{ ok: true } | { ok: false; message: string }> {
  const isMobile =
    Boolean(input.gateRow.mobile_provider) ||
    String(input.gateRow.bank_name || "").toLowerCase().includes("mobile money")
  const rail: PayoutRail = isMobile ? "mobile_money" : "bank_transfer"
  const countryCode = resolveRecipientPayoutCountry(input.gateRow)
  const currencyCode = String(input.gateRow.currency || "").trim().toUpperCase()

  const providerRouting =
    countryCode && currencyCode
      ? await loadCorridorRouting(input.admin, {
          countryCode,
          currencyCode,
          rail,
        })
      : []

  const { data: corridor } =
    countryCode && currencyCode
      ? await input.admin
          .from("payout_corridors")
          .select("fields_schema,provider_routing")
          .eq("country_code", countryCode)
          .eq("currency_code", currencyCode)
          .eq("rail", rail)
          .maybeSingle()
      : { data: null }

  const routing = providerRouting.length
    ? providerRouting
    : ((corridor?.provider_routing as typeof providerRouting | null) ?? [])
  const provider = resolvePrimaryPayoutProvider(routing)
  const noahHints = unwrapNoahFieldsSchema(corridor?.fields_schema)

  let ycLimits = null
  let customerRate: number | undefined
  if (provider === "yellowcard" && input.sourceBalanceCurrency.trim().toUpperCase() === "USD") {
    if (countryCode) {
      const sendChannel = await findYcSendChannel({
        countryCode,
        currencyCode,
        rail,
      })
      ycLimits = resolveYcPayoutLimits({
        country: countryCode,
        currency: currencyCode,
        rail,
        channel: sendChannel as Record<string, unknown> | null,
      })
    }
    const rates = await listYcRates(input.admin, {
      destinations: [currencyCode],
      status: "active",
    })
    customerRate = findYcBalancePayoutRate(rates, currencyCode)?.rate
  }

  const check = validateBalancePayoutAmountForProvider({
    providerRouting: routing,
    sourceBalanceCurrency: input.sourceBalanceCurrency,
    amountEntryMode: input.amountEntryMode,
    receiveAmount: input.receiveAmount,
    sendAmount: input.sendBudget,
    sendCurrency: input.sourceBalanceCurrency,
    receiveCurrency: currencyCode,
    rail,
    noahHints,
    ycLimits,
    customerRate,
  })

  return check.ok ? { ok: true } : { ok: false, message: check.message }
}
