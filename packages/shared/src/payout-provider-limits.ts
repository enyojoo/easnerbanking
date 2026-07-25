import type { ProviderRoutingEntry } from "./send-destinations"
import type { PayoutFieldsSchemaHint, PayoutProviderId, PayoutRail } from "./payout-corridor"
import { resolvePrimaryPayoutProvider } from "./payout-corridor"
import {
  validateNoahPayInLocalAmount,
  validatePayoutAmountAgainstLimitsForEntry,
  type SendAmountFieldValidation,
} from "./payout-form-schema"
import {
  validateYcBalancePayoutAmount,
  type YcPayoutLimits,
} from "./yc-payout-limits"
import {
  validateYcPayInLocalAmount,
  type YcPayInLimits,
} from "./yc-pay-in-limits"

export type PayInProviderId = "yellowcard" | "noah" | "grid"

function resolvePayInProviderFromCaps(input: {
  payoutProvider: PayInProviderId
  payoutLocked: PayInProviderId | null
  supportYcPayIn: boolean
  supportNoahPayIn: boolean
}): PayInProviderId | null {
  if (input.payoutLocked === "noah") {
    if (input.supportYcPayIn) return "yellowcard"
    if (input.supportNoahPayIn) return "noah"
    return null
  }
  if (input.payoutLocked === "yellowcard") {
    if (input.supportYcPayIn) return "yellowcard"
    if (input.supportNoahPayIn) return "noah"
    return null
  }

  const secondary: PayInProviderId = input.payoutProvider === "noah" ? "yellowcard" : "noah"
  if (secondary === "yellowcard" && input.supportYcPayIn) return "yellowcard"
  if (secondary === "noah" && input.supportNoahPayIn) return "noah"
  if (input.payoutProvider === "yellowcard" && input.supportYcPayIn) return "yellowcard"
  if (input.payoutProvider === "noah" && input.supportNoahPayIn) return "noah"
  return null
}

/** Office pay-in routing: secondary provider when dual corridor, else explicit metadata. */
export function resolvePayInProvider(input: {
  providerRouting?: ProviderRoutingEntry[] | null
  metadata?: Record<string, unknown> | null
}): PayInProviderId {
  const explicit = String(input.metadata?.pay_in_provider ?? "").trim().toLowerCase()
  if (explicit === "yellowcard" || explicit === "noah" || explicit === "grid") return explicit

  const meta = input.metadata ?? {}

  // Match Office Platform Control toggles — capability flags alone must not activate pay-in.
  if (meta.noah_receive_enabled === true) return "noah"
  if (meta.yc_receive_enabled === true) return "yellowcard"
  if (meta.grid_receive_enabled === true) return "grid"

  const routing = input.providerRouting ?? []
  const payoutProvider = resolvePrimaryPayoutProvider(routing)
  const supportYcPayIn = meta.yc_receive === true && meta.yc_receive_enabled === true
  const supportNoahPayIn = meta.noah_receive === true && meta.noah_receive_enabled === true
  const supportGridPayIn = meta.grid_receive === true && meta.grid_receive_enabled === true
  const supportYcPayout =
    meta.yc_send === true || routing.some((e) => e.provider === "yellowcard")
  const supportNoahPayout =
    routing.some((e) => e.provider === "noah") || (!supportYcPayout && !supportNoahPayIn)
  const payoutLocked: PayInProviderId | null =
    supportNoahPayout && !supportYcPayout
      ? "noah"
      : !supportNoahPayout && supportYcPayout
        ? "yellowcard"
        : null

  const resolved = resolvePayInProviderFromCaps({
    payoutProvider,
    payoutLocked,
    supportYcPayIn,
    supportNoahPayIn,
  })
  if (resolved) return resolved
  if (supportGridPayIn) return "grid"
  if (supportYcPayIn) return "yellowcard"
  return "noah"
}

export type ValidatePayInAmountInput = {
  providerRouting?: ProviderRoutingEntry[] | null
  metadata?: Record<string, unknown> | null
  provider?: PayInProviderId
  localPayIn: number
  currency: string
  rail?: PayoutRail
  noahHints?: PayoutFieldsSchemaHint | null
  ycLimits?: YcPayInLimits | null
  gridLimits?: YcPayInLimits | null
}

/** Validate fund-balance / pay-in amounts for the Office-selected provider. */
export function validatePayInAmountForProvider(
  input: ValidatePayInAmountInput,
): SendAmountFieldValidation {
  const provider = input.provider ?? resolvePayInProvider(input)
  const rail = input.rail ?? "bank_transfer"
  if (provider === "yellowcard" && input.ycLimits) {
    return validateYcPayInLocalAmount({
      localPayIn: input.localPayIn,
      currency: input.currency,
      limits: input.ycLimits,
    })
  }
  if (provider === "grid") {
    const limits = input.gridLimits ?? input.ycLimits
    if (limits?.minLocalPayIn != null || limits?.maxLocalPayIn != null) {
      return validateYcPayInLocalAmount({
        localPayIn: input.localPayIn,
        currency: input.currency,
        limits,
      })
    }
    if (input.localPayIn > 0) return { ok: true }
    return { ok: false, message: "Enter a valid amount." }
  }
  return validateNoahPayInLocalAmount({
    localPayIn: input.localPayIn,
    currency: input.currency,
    hints: input.noahHints,
    rail,
  })
}

export type ValidateBalancePayoutAmountInput = {
  providerRouting?: ProviderRoutingEntry[] | null
  /** Explicit override — otherwise derived from routing priority 1. */
  provider?: PayoutProviderId
  sourceBalanceCurrency: string
  amountEntryMode?: "send" | "receive"
  receiveAmount: number
  sendAmount?: number
  customerRate?: number
  sendCurrency?: string
  receiveCurrency: string
  rail?: PayoutRail
  noahHints?: PayoutFieldsSchemaHint | null
  ycLimits?: YcPayoutLimits | null
  isEasetag?: boolean
}

/**
 * Validate balance payout amounts using limits for the Office-selected primary provider.
 * Yellowcard USD balance payouts use YC channel/policy mins; Noah uses fields_schema + policy.
 */
export function validateBalancePayoutAmountForProvider(
  input: ValidateBalancePayoutAmountInput,
): SendAmountFieldValidation {
  const provider = input.provider ?? resolvePrimaryPayoutProvider(input.providerRouting)
  const amountEntryMode = input.amountEntryMode === "send" ? "send" : "receive"
  const rail = input.rail ?? "bank_transfer"
  const source = input.sourceBalanceCurrency.trim().toUpperCase()
  const customerRate = input.customerRate ?? 0

  if (
    provider === "yellowcard" &&
    source === "USD" &&
    input.ycLimits &&
    Number.isFinite(customerRate) &&
    customerRate > 0
  ) {
    const sendAmount =
      input.sendAmount != null && input.sendAmount > 0
        ? input.sendAmount
        : amountEntryMode === "send"
          ? 0
          : Math.round((input.receiveAmount / customerRate) * 100) / 100
    return validateYcBalancePayoutAmount({
      amountEntryMode,
      receiveAmount: input.receiveAmount,
      sendAmount,
      customerRate,
      receiveCurrency: input.receiveCurrency,
      limits: input.ycLimits,
      rail,
    })
  }

  return validatePayoutAmountAgainstLimitsForEntry({
    amountEntryMode,
    receiveAmount: input.receiveAmount,
    customerRate: input.customerRate,
    sendCurrency: input.sendCurrency,
    hints: input.noahHints,
    currencyCode: input.receiveCurrency,
    rail,
    isEasetag: input.isEasetag,
  })
}
