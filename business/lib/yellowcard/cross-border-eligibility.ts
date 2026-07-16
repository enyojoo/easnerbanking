import type { SupabaseClient } from "@supabase/supabase-js"
import { findYcCrossRate, listYcRates } from "@/lib/fx/yc-rates"
import { resolveYcSendChannelId } from "@/lib/payout-providers/yellowcard-provider"
import { isYcLocalPayInEnabledForCountry } from "@/lib/yellowcard/yc-receive-gate"
import { resolveRecipientPayoutCountry } from "@/lib/terminal/recipient-sell-prepare"
import {
  mapResidenceToLocalCurrency,
  resolveRecipientYcSendRail,
  type ThroughLocalCurrencyReason,
} from "@/lib/yellowcard/cross-border-eligibility-shared"

export {
  mapResidenceToLocalCurrency,
  resolveRecipientYcSendRail,
  type ThroughLocalCurrencyReason,
} from "@/lib/yellowcard/cross-border-eligibility-shared"

export type ThroughLocalCurrencyEligibility = {
  payInCurrency: string | null
  available: boolean
  reason?: ThroughLocalCurrencyReason
}

/** Whether Send → Through Local Currency is offered for this payer + recipient pair. */
export async function resolveThroughLocalCurrencyEligibility(
  admin: SupabaseClient,
  input: {
    residenceCountry: string
    payInCurrency: string | null
    recipient: {
      currency?: string | null
      mobile_provider?: string | null
      bank_name?: string | null
    }
  },
): Promise<ThroughLocalCurrencyEligibility> {
  const payInCurrency = input.payInCurrency
  const receiveCurrency = String(input.recipient.currency ?? "")
    .trim()
    .toUpperCase()
  const receiveCountry = resolveRecipientPayoutCountry(input.recipient as never)

  if (!payInCurrency) {
    return { payInCurrency: null, available: false, reason: "receive_not_enabled" }
  }
  if (payInCurrency === receiveCurrency) {
    return { payInCurrency, available: false, reason: "same_currency" }
  }

  const ycReceiveOn = await isYcLocalPayInEnabledForCountry(admin, input.residenceCountry)
  if (!ycReceiveOn) {
    return { payInCurrency, available: false, reason: "receive_not_enabled" }
  }

  const rates = await listYcRates(admin, { status: "active" })
  const cross = findYcCrossRate(rates, payInCurrency, receiveCurrency)
  if (!cross?.rate) {
    return { payInCurrency, available: false, reason: "corridor_disabled" }
  }

  if (!receiveCountry) {
    return { payInCurrency, available: false, reason: "recipient_not_yc" }
  }

  const sendRail = resolveRecipientYcSendRail(input.recipient)
  const sendChannelId = await resolveYcSendChannelId({
    countryCode: receiveCountry,
    currencyCode: receiveCurrency,
    rail: sendRail,
  })
  if (!sendChannelId) {
    return { payInCurrency, available: false, reason: "recipient_not_yc" }
  }

  return { payInCurrency, available: true }
}
