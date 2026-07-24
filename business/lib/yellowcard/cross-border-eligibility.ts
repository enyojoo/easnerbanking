import type { SupabaseClient } from "@supabase/supabase-js"
import type { CrossBorderProviderId } from "@easner/shared"
import { findGridCrossRate, listGridRates } from "@/lib/fx/grid-rates"
import { findYcCrossRate, listYcRates } from "@/lib/fx/yc-rates"
import { corridorHasGridPayout } from "@/lib/payout-providers/grid-provider"
import { loadCorridorRouting } from "@/lib/payout-providers/router"
import { resolveYcSendChannelId } from "@/lib/payout-providers/yellowcard-provider"
import {
  resolveCrossBorderProviderForDestination,
  resolveCrossBorderSourcePayInEnabled,
} from "@/lib/cross-border/routing"
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
  provider: CrossBorderProviderId | null
  payInCurrency: string | null
  available: boolean
  reason?: ThroughLocalCurrencyReason
}

async function resolveYellowcardThroughLocalCurrency(
  admin: SupabaseClient,
  input: {
    residenceCountry: string
    payInCurrency: string
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

  const payInEnabled = await resolveCrossBorderSourcePayInEnabled(admin, {
    provider: "yellowcard",
    sourceCountry: input.residenceCountry,
    sourceCurrency: payInCurrency,
  })
  if (!payInEnabled) {
    return {
      provider: "yellowcard",
      payInCurrency,
      available: false,
      reason: "receive_not_enabled",
    }
  }

  const rates = await listYcRates(admin, { status: "active" })
  const cross = findYcCrossRate(rates, payInCurrency, receiveCurrency)
  if (!cross?.rate) {
    return {
      provider: "yellowcard",
      payInCurrency,
      available: false,
      reason: "corridor_disabled",
    }
  }

  if (!receiveCountry) {
    return {
      provider: "yellowcard",
      payInCurrency,
      available: false,
      reason: "recipient_not_yc",
    }
  }

  const sendRail = resolveRecipientYcSendRail(input.recipient)
  const sendChannelId = await resolveYcSendChannelId({
    countryCode: receiveCountry,
    currencyCode: receiveCurrency,
    rail: sendRail,
  })
  if (!sendChannelId) {
    return {
      provider: "yellowcard",
      payInCurrency,
      available: false,
      reason: "recipient_not_yc",
    }
  }

  return { provider: "yellowcard", payInCurrency, available: true }
}

async function resolveGridThroughLocalCurrency(
  admin: SupabaseClient,
  input: {
    residenceCountry: string
    payInCurrency: string
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
  const sendRail = resolveRecipientYcSendRail(input.recipient)

  const payInEnabled = await resolveCrossBorderSourcePayInEnabled(admin, {
    provider: "grid",
    sourceCountry: input.residenceCountry,
    sourceCurrency: payInCurrency,
    rail: sendRail,
  })
  if (!payInEnabled) {
    return {
      provider: "grid",
      payInCurrency,
      available: false,
      reason: "receive_not_enabled",
    }
  }

  const rates = await listGridRates(admin, {
    destinations: [payInCurrency, receiveCurrency],
    status: "active",
  })
  const cross = findGridCrossRate(rates, payInCurrency, receiveCurrency)
  if (!cross?.rate) {
    return {
      provider: "grid",
      payInCurrency,
      available: false,
      reason: "corridor_disabled",
    }
  }

  if (!receiveCountry) {
    return {
      provider: "grid",
      payInCurrency,
      available: false,
      reason: "recipient_not_yc",
    }
  }

  const routing = await loadCorridorRouting(admin, {
    countryCode: receiveCountry,
    currencyCode: receiveCurrency,
    rail: sendRail,
  })
  const payoutOk = await corridorHasGridPayout(admin, {
    countryCode: receiveCountry,
    currencyCode: receiveCurrency,
    rail: sendRail,
    providerRouting: routing,
  })
  if (!payoutOk) {
    return {
      provider: "grid",
      payInCurrency,
      available: false,
      reason: "recipient_not_yc",
    }
  }

  return { provider: "grid", payInCurrency, available: true }
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
    return { provider: null, payInCurrency: null, available: false, reason: "receive_not_enabled" }
  }
  if (payInCurrency === receiveCurrency) {
    return { provider: null, payInCurrency, available: false, reason: "same_currency" }
  }

  const sendRail = resolveRecipientYcSendRail(input.recipient)
  const provider =
    receiveCountry && receiveCurrency
      ? await resolveCrossBorderProviderForDestination(admin, {
          countryCode: receiveCountry,
          currencyCode: receiveCurrency,
          rail: sendRail,
        })
      : null

  if (!provider) {
    return { provider: null, payInCurrency, available: false, reason: "corridor_disabled" }
  }

  if (provider === "grid") {
    return resolveGridThroughLocalCurrency(admin, {
      residenceCountry: input.residenceCountry,
      payInCurrency,
      recipient: input.recipient,
    })
  }

  return resolveYellowcardThroughLocalCurrency(admin, {
    residenceCountry: input.residenceCountry,
    payInCurrency,
    recipient: input.recipient,
  })
}
