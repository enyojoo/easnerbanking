import type { PayoutRail } from "./payout-corridor"
import { formatMoneyDisplay } from "./format-money-display"
import { normalizePayoutReceiveAmountForCurrency } from "./noah-send-rates"
import { parseYcChannelPayInLimits } from "./yc-pay-in-limits"
import { YC_SEND_LIMITS_FALLBACK, ycCorridorLimitKey } from "./yc-corridor-limit-fallbacks"

/** YC direct-settlement disbursement requires cryptoAmount strictly above 1 USD. */
export const YC_DIRECT_SETTLEMENT_MIN_SEND_USDC_EXCLUSIVE = 1.01

export type YcPayoutLimits = {
  minSendUsd: number
  minLocalReceive: number | null
  maxLocalReceive: number | null
}

/** Published send limits — fallback when channel omits min/max. */
const YC_SEND_LIMITS_FALLBACK_LOCAL = YC_SEND_LIMITS_FALLBACK

/**
 * Easner minimum receive amounts for YC balance payouts (bank + mobile money).
 * Separate from Noah policy in payout-business-limits.ts — YC corridors can differ.
 */
const YC_PAYOUT_BUSINESS_MIN_BANK: Record<string, number> = {
  NGN: 2000,
  KES: 500,
  GHS: 20,
  RWF: 6000,
  ZAR: 200,
  TZS: 2500,
  UGX: 15_000,
  ZMW: 50_000,
  XOF: 500,
  XAF: 1000,
  MWK: 2000,
  BWP: 150,
  CDF: 10_000,
  MXN: 100,
  BRL: 50,
  ARS: 5000,
  COP: 20_000,
  PEN: 20,
  USD: 20,
  EUR: 10,
  GBP: 10,
  CAD: 10,
  AED: 20,
  CNY: 50,
  EGP: 100,
  PHP: 50,
  THB: 50,
  INR: 100,
  IDR: 10_000,
  LKR: 500,
}

const YC_PAYOUT_BUSINESS_MIN_MOBILE: Record<string, number> = {
  NGN: 2000,
  KES: 500,
  GHS: 20,
  RWF: 6000,
  ZAR: 200,
  TZS: 2500,
  UGX: 15_000,
  ZMW: 100,
  XOF: 500,
  XAF: 1000,
  MWK: 2000,
  BWP: 150,
  CDF: 10_000,
  EGP: 100,
}

/** Product minimum for a YC payout currency/rail, or null when no policy is defined. */
export function getYcBusinessPayoutMin(
  currencyCode: string,
  rail: PayoutRail = "bank_transfer",
): number | null {
  const cur = String(currencyCode || "").trim().toUpperCase()
  if (!cur) return null
  if (rail === "mobile_money") {
    const mobile = YC_PAYOUT_BUSINESS_MIN_MOBILE[cur]
    if (mobile != null) return mobile
  }
  const bank = YC_PAYOUT_BUSINESS_MIN_BANK[cur]
  return bank ?? null
}

function corridorLimitKey(country: string, currency: string, rail: PayoutRail): string {
  return ycCorridorLimitKey(country, currency, rail)
}

function mergePayoutMin(
  channelMin: number | null,
  fallbackMin: number | undefined,
  businessMin: number | null,
): number | null {
  const candidates = [channelMin, fallbackMin, businessMin].filter(
    (n): n is number => n != null && Number.isFinite(n) && n > 0,
  )
  if (!candidates.length) return null
  return Math.max(...candidates)
}

export function resolveYcPayoutLimits(input: {
  country: string
  currency: string
  rail: PayoutRail
  channel?: Record<string, unknown> | null
}): YcPayoutLimits {
  const fromChannel = parseYcChannelPayInLimits(input.channel)
  const fallback = YC_SEND_LIMITS_FALLBACK_LOCAL[corridorLimitKey(input.country, input.currency, input.rail)]
  const businessMin = getYcBusinessPayoutMin(input.currency, input.rail)
  return {
    minSendUsd: YC_DIRECT_SETTLEMENT_MIN_SEND_USDC_EXCLUSIVE,
    minLocalReceive: mergePayoutMin(fromChannel.minLocalPayIn, fallback?.min, businessMin),
    maxLocalReceive: fromChannel.maxLocalPayIn ?? fallback?.max ?? null,
  }
}

export function parseYcSendRejectedMinError(
  message: string,
): { minSendUsd?: number; minLocalReceive?: number; currency?: string } | null {
  const text = String(message || "")
  const usd = text.match(/more than\s+([\d,]+(?:\.\d+)?)\s+USD/i)
  if (usd) {
    const parsed = Number.parseFloat(usd[1].replace(/,/g, ""))
    if (Number.isFinite(parsed) && parsed > 0) {
      return { minSendUsd: Math.round((parsed + 0.01) * 100) / 100 }
    }
  }
  const local = text.match(/more than\s+([\d,]+(?:\.\d+)?)\s+([A-Za-z]{3})/i)
  if (local) {
    const minLocalReceive = Number.parseFloat(local[1].replace(/,/g, ""))
    const currency = local[2].trim().toUpperCase()
    if (Number.isFinite(minLocalReceive) && minLocalReceive > 0 && currency) {
      return { minLocalReceive, currency }
    }
  }
  return null
}

function roundUsd(n: number): number {
  return Math.round(n * 100) / 100
}

function roundReceive(currency: string, amount: number): number {
  return normalizePayoutReceiveAmountForCurrency(currency, amount)
}

export function computeMinReceiveForYcSendUsd(input: {
  minSendUsd: number
  customerRate: number
  receiveCurrency: string
}): number {
  const rate = input.customerRate
  if (!Number.isFinite(rate) || rate <= 0) return 0
  let usd = roundUsd(input.minSendUsd)
  let receive = roundReceive(input.receiveCurrency, usd * rate)
  let iterations = 0
  while (receive / rate <= input.minSendUsd && iterations < 5000) {
    usd = roundUsd(usd + 0.01)
    receive = roundReceive(input.receiveCurrency, usd * rate)
    iterations += 1
  }
  return receive
}

export function resolveEffectiveYcBalancePayoutMinReceive(input: {
  customerRate: number
  receiveCurrency: string
  limits: YcPayoutLimits
  businessMinReceive?: number | null
}): number | null {
  const candidates: number[] = []
  if (input.businessMinReceive != null && input.businessMinReceive > 0) {
    candidates.push(roundReceive(input.receiveCurrency, input.businessMinReceive))
  }
  if (input.limits.minLocalReceive != null && input.limits.minLocalReceive > 0) {
    candidates.push(roundReceive(input.receiveCurrency, input.limits.minLocalReceive))
  }
  const fromUsd = computeMinReceiveForYcSendUsd({
    minSendUsd: input.limits.minSendUsd,
    customerRate: input.customerRate,
    receiveCurrency: input.receiveCurrency,
  })
  if (fromUsd > 0) candidates.push(fromUsd)
  if (!candidates.length) return null
  return Math.max(...candidates)
}

export type YcPayoutAmountValidation = { ok: true } | { ok: false; message: string }

export function validateYcBalancePayoutAmount(input: {
  amountEntryMode: "send" | "receive"
  receiveAmount: number
  sendAmount: number
  customerRate: number
  receiveCurrency: string
  limits: YcPayoutLimits
  rail?: PayoutRail
  businessMinReceive?: number | null
}): YcPayoutAmountValidation {
  const cur = input.receiveCurrency.trim().toUpperCase()
  const receive = roundReceive(cur, input.receiveAmount)
  const send = roundUsd(input.sendAmount)
  if (!Number.isFinite(receive) || receive <= 0) {
    return { ok: false, message: "Enter a valid amount." }
  }

  const businessMinReceive =
    input.businessMinReceive ??
    getYcBusinessPayoutMin(cur, input.rail ?? "bank_transfer")

  const minReceive = resolveEffectiveYcBalancePayoutMinReceive({
    customerRate: input.customerRate,
    receiveCurrency: cur,
    limits: input.limits,
    businessMinReceive,
  })
  if (minReceive != null && receive < minReceive) {
    const minUsd = roundUsd(input.limits.minSendUsd)
    return {
      ok: false,
      message: `Minimum payout is ${formatMoneyDisplay(minReceive, cur)} (~${formatMoneyDisplay(minUsd, "USD")}).`,
    }
  }

  if (input.amountEntryMode === "send") {
    if (!Number.isFinite(send) || send <= 0) {
      return { ok: false, message: "Enter a valid amount." }
    }
    if (send < input.limits.minSendUsd) {
      return {
        ok: false,
        message: `Minimum payout is ${formatMoneyDisplay(input.limits.minSendUsd, "USD")}.`,
      }
    }
    const impliedUsd = roundUsd(receive / input.customerRate)
    if (impliedUsd < input.limits.minSendUsd) {
      return {
        ok: false,
        message: `Minimum payout is ${formatMoneyDisplay(input.limits.minSendUsd, "USD")}.`,
      }
    }
  } else {
    const impliedUsd = roundUsd(receive / input.customerRate)
    if (impliedUsd < input.limits.minSendUsd) {
      const minReceiveFromUsd = computeMinReceiveForYcSendUsd({
        minSendUsd: input.limits.minSendUsd,
        customerRate: input.customerRate,
        receiveCurrency: cur,
      })
      return {
        ok: false,
        message: `Minimum payout is ${formatMoneyDisplay(minReceiveFromUsd, cur)} (~${formatMoneyDisplay(input.limits.minSendUsd, "USD")}).`,
      }
    }
  }

  const max = input.limits.maxLocalReceive
  if (max != null && receive > max) {
    return { ok: false, message: `Maximum payout is ${formatMoneyDisplay(max, cur)}.` }
  }

  return { ok: true }
}

export function formatYcPayoutMinHint(input: {
  minReceive: number
  receiveCurrency: string
  minSendUsd: number
}): string {
  return `Minimum payout ${formatMoneyDisplay(input.minReceive, input.receiveCurrency)} (~${formatMoneyDisplay(input.minSendUsd, "USD")})`
}

export const YC_PAYOUT_MIN_ENFORCE_DEBOUNCE_MS = 3000

const MAX_SEND_BUMP_ITERATIONS = 5000

export function computeEnteredAmountForYcPayoutMin(input: {
  minReceive: number
  amountEntryMode: "send" | "receive"
  customerRate: number
  receiveCurrency: string
  minSendUsd: number
}): number {
  const minReceive = roundReceive(input.receiveCurrency, input.minReceive)
  if (minReceive <= 0) return 0
  if (input.amountEntryMode === "receive") return minReceive

  const rate = input.customerRate
  if (!Number.isFinite(rate) || rate <= 0) return 0
  let sendAmount = roundUsd(minReceive / rate)
  if (sendAmount < input.minSendUsd) sendAmount = input.minSendUsd

  let iterations = 0
  while (iterations < MAX_SEND_BUMP_ITERATIONS) {
    const receive = roundReceive(input.receiveCurrency, sendAmount * rate)
    if (receive >= minReceive && sendAmount >= input.minSendUsd) return sendAmount
    sendAmount = roundUsd(sendAmount + 0.01)
    iterations += 1
  }
  return sendAmount
}

export function ycPayoutReceiveMeetsMin(input: {
  receiveAmount: number
  minReceive: number
  receiveCurrency: string
}): boolean {
  const receive = roundReceive(input.receiveCurrency, input.receiveAmount)
  const min = roundReceive(input.receiveCurrency, input.minReceive)
  return receive > 0 && receive >= min
}
