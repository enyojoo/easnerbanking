import type { PayoutRail } from "./payout-corridor"
import { formatMoneyDisplay } from "./format-money-display"
import { YC_RECEIVE_LIMITS_FALLBACK, ycCorridorLimitKey } from "./yc-corridor-limit-fallbacks"

export type YcPayInRail = PayoutRail

export type YcPayInLimits = {
  minLocalPayIn: number | null
  maxLocalPayIn: number | null
}

/** Easner minimum local pay-in when YC channel omits a floor. */
const YC_PAYIN_BUSINESS_MIN_BANK: Record<string, number> = {
  NGN: 2500,
  KES: 300,
  GHS: 20,
  RWF: 100,
  ZAR: 100,
  TZS: 2500,
  UGX: 15_000,
  ZMW: 100,
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

const YC_PAYIN_BUSINESS_MIN_MOBILE: Record<string, number> = {
  NGN: 2500,
  KES: 150,
  GHS: 20,
  RWF: 1500,
  ZAR: 100,
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

export function getYcBusinessPayInMin(
  currencyCode: string,
  rail: YcPayInRail = "bank_transfer",
): number | null {
  const cur = String(currencyCode || "").trim().toUpperCase()
  if (!cur) return null
  if (rail === "mobile_money") {
    const mobile = YC_PAYIN_BUSINESS_MIN_MOBILE[cur]
    if (mobile != null) return mobile
  }
  return YC_PAYIN_BUSINESS_MIN_BANK[cur] ?? null
}

function mergeMin(
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

function parsePositiveLimit(raw: unknown): number | null {
  if (raw == null || String(raw).trim() === "") return null
  const n = Number.parseFloat(String(raw).replace(/,/g, ""))
  if (!Number.isFinite(n) || n <= 0) return null
  return n
}

/** Parse min/max from a YC `/channels` deposit row (field names vary by API version). */
export function parseYcChannelPayInLimits(
  channel: Record<string, unknown> | null | undefined,
): YcPayInLimits {
  if (!channel || typeof channel !== "object") {
    return { minLocalPayIn: null, maxLocalPayIn: null }
  }

  const limits =
    channel.limits && typeof channel.limits === "object"
      ? (channel.limits as Record<string, unknown>)
      : undefined

  const minRaw =
    channel.minAmount ??
    channel.min_amount ??
    channel.min ??
    channel.minimum ??
    channel.MinAmount ??
    limits?.min ??
    limits?.minAmount ??
    limits?.MinLimit ??
    limits?.minimum

  const maxRaw =
    channel.maxAmount ??
    channel.max_amount ??
    channel.max ??
    channel.maximum ??
    channel.MaxAmount ??
    limits?.max ??
    limits?.maxAmount ??
    limits?.MaxLimit ??
    limits?.maximum

  const minLocalPayIn = parsePositiveLimit(minRaw)
  let maxLocalPayIn = parsePositiveLimit(maxRaw)
  // YC: max 0 means no provider max.
  if (maxRaw != null && Number.parseFloat(String(maxRaw)) === 0) {
    maxLocalPayIn = null
  }

  return { minLocalPayIn, maxLocalPayIn }
}

export function resolveYcPayInLimits(input: {
  country: string
  currency: string
  rail: YcPayInRail
  channel?: Record<string, unknown> | null
}): YcPayInLimits {
  const fromChannel = parseYcChannelPayInLimits(input.channel)
  const fallback = YC_RECEIVE_LIMITS_FALLBACK[ycCorridorLimitKey(input.country, input.currency, input.rail)]
  const businessMin = getYcBusinessPayInMin(input.currency, input.rail)

  return {
    minLocalPayIn: mergeMin(fromChannel.minLocalPayIn, fallback?.min, businessMin),
    maxLocalPayIn: fromChannel.maxLocalPayIn ?? fallback?.max ?? null,
  }
}

export function parseYcReceiveRejectedMinError(
  message: string,
): { minLocalPayIn: number; currency: string } | null {
  const match = String(message).match(/more than\s+([\d,]+(?:\.\d+)?)\s+([A-Za-z]{3})/i)
  if (!match) return null
  const minLocalPayIn = Number.parseFloat(match[1].replace(/,/g, ""))
  const currency = match[2].trim().toUpperCase()
  if (!Number.isFinite(minLocalPayIn) || minLocalPayIn <= 0 || !currency) return null
  return { minLocalPayIn, currency }
}

export type YcPayInAmountValidation = { ok: true } | { ok: false; message: string }

export function validateYcPayInLocalAmount(input: {
  localPayIn: number
  currency: string
  limits: YcPayInLimits
}): YcPayInAmountValidation {
  const cur = input.currency.trim().toUpperCase()
  const amount = input.localPayIn
  if (!Number.isFinite(amount) || amount <= 0) {
    return { ok: false, message: "Enter a valid amount" }
  }

  const min = input.limits.minLocalPayIn
  if (min != null && amount < min) {
    return {
      ok: false,
      message: `Minimum deposit is ${formatMoneyDisplay(min, cur)}.`,
    }
  }

  const max = input.limits.maxLocalPayIn
  if (max != null && amount > max) {
    return {
      ok: false,
      message: `Maximum deposit is ${formatMoneyDisplay(max, cur)}.`,
    }
  }

  return { ok: true }
}

/** Validate fund-balance entry using preview local pay-in (USD or local entry modes). */
export function validateYcFundBalancePayInAmount(input: {
  amountEntryMode: "usd" | "local"
  enteredAmount: number
  previewLocalPayIn: number
  currency: string
  limits: YcPayInLimits
}): YcPayInAmountValidation {
  const localPayIn =
    input.amountEntryMode === "local" && input.enteredAmount > 0
      ? input.enteredAmount
      : input.previewLocalPayIn

  return validateYcPayInLocalAmount({
    localPayIn,
    currency: input.currency,
    limits: input.limits,
  })
}

export function formatYcPayInMinHint(input: {
  minLocalPayIn: number
  currency: string
  customerSellRate?: number | null
}): string {
  const local = formatMoneyDisplay(input.minLocalPayIn, input.currency)
  const rate = input.customerSellRate
  if (rate != null && Number.isFinite(rate) && rate > 0) {
    const minUsd = Math.round((input.minLocalPayIn / rate) * 100) / 100
    return `Minimum deposit ${local} (~${formatMoneyDisplay(minUsd, "USD")})`
  }
  return `Minimum deposit ${local}`
}

/** Local pay-in (send currency) implied by the active TLC send amount box. */
export function computeCrossBorderSendLocalPayIn(input: {
  amountEntryMode: "send" | "receive"
  enteredAmount: number
  customerRate: number
}): number {
  if (input.enteredAmount <= 0) return 0
  const rate = input.customerRate
  if (!Number.isFinite(rate) || rate <= 0) return 0
  if (input.amountEntryMode === "send") return input.enteredAmount
  return Math.round((input.enteredAmount / rate) * 100) / 100
}

export function crossBorderSendLocalPayInMeetsMin(input: {
  amountEntryMode: "send" | "receive"
  enteredAmount: number
  customerRate: number
  minLocalPayIn: number
}): boolean {
  const localPayIn = computeCrossBorderSendLocalPayIn({
    amountEntryMode: input.amountEntryMode,
    enteredAmount: input.enteredAmount,
    customerRate: input.customerRate,
  })
  return localPayIn > 0 && localPayIn >= input.minLocalPayIn
}

/**
 * Entered amount for the active TLC box so implied local pay-in is at least `minLocalPayIn`.
 * Send mode bumps pay-in currency; receive mode bumps recipient currency using the cross rate.
 */
export function computeCrossBorderSendEnteredAmountForMin(input: {
  minLocalPayIn: number
  amountEntryMode: "send" | "receive"
  customerRate: number
}): number {
  if (input.minLocalPayIn <= 0) return 0
  const rate = input.customerRate
  if (!Number.isFinite(rate) || rate <= 0) return 0

  if (input.amountEntryMode === "send") return input.minLocalPayIn

  let receive = Math.round(input.minLocalPayIn * rate * 100) / 100
  if (receive <= 0) receive = 0.01

  let iterations = 0
  while (
    computeCrossBorderSendLocalPayIn({
      amountEntryMode: "receive",
      enteredAmount: receive,
      customerRate: rate,
    }) < input.minLocalPayIn &&
    iterations < MAX_USD_BUMP_ITERATIONS
  ) {
    receive = Math.round((receive + 0.01) * 100) / 100
    iterations += 1
  }

  return receive
}

export function validateYcCrossBorderSendAmount(input: {
  amountEntryMode: "send" | "receive"
  enteredAmount: number
  customerRate: number
  payInCurrency: string
  limits: YcPayInLimits
}): YcPayInAmountValidation {
  const localPayIn = computeCrossBorderSendLocalPayIn({
    amountEntryMode: input.amountEntryMode,
    enteredAmount: input.enteredAmount,
    customerRate: input.customerRate,
  })
  const result = validateYcPayInLocalAmount({
    localPayIn,
    currency: input.payInCurrency,
    limits: input.limits,
  })
  if (!result.ok && result.message.includes("Minimum deposit")) {
    return {
      ok: false,
      message: result.message.replace("Minimum deposit", "Minimum transfer"),
    }
  }
  return result
}

export function formatYcCrossBorderSendMinHint(input: {
  minLocalPayIn: number
  payInCurrency: string
  receiveCurrency: string
  customerRate: number
}): string {
  const local = formatMoneyDisplay(input.minLocalPayIn, input.payInCurrency)
  const minReceive = computeCrossBorderSendEnteredAmountForMin({
    minLocalPayIn: input.minLocalPayIn,
    amountEntryMode: "receive",
    customerRate: input.customerRate,
  })
  const receive = formatMoneyDisplay(minReceive, input.receiveCurrency)
  return `Minimum transfer ${local} (~${receive})`
}

export function computePreviewLocalPayIn(input: {
  amountEntryMode: "usd" | "local"
  enteredAmount: number
  customerSellRate: number
}): number {
  if (input.enteredAmount <= 0) return 0
  if (input.amountEntryMode === "local") return input.enteredAmount
  if (!Number.isFinite(input.customerSellRate) || input.customerSellRate <= 0) return 0
  return Math.round(input.enteredAmount * input.customerSellRate * 100) / 100
}

export function localPayInMeetsMin(input: {
  previewLocalPayIn: number
  minLocalPayIn: number
}): boolean {
  return input.previewLocalPayIn > 0 && input.previewLocalPayIn >= input.minLocalPayIn
}

const MAX_USD_BUMP_ITERATIONS = 5000

/**
 * Entered amount for the active box so preview local pay-in is at least `minLocalPayIn`.
 * USD mode bumps in 0.01 steps when rate rounding would otherwise land below min.
 */
export function computeEnteredAmountForLocalPayInMin(input: {
  minLocalPayIn: number
  amountEntryMode: "usd" | "local"
  customerSellRate: number
}): number {
  if (input.minLocalPayIn <= 0) return 0
  if (input.amountEntryMode === "local") return input.minLocalPayIn

  const rate = input.customerSellRate
  if (!Number.isFinite(rate) || rate <= 0) return 0

  let usd = Math.round((input.minLocalPayIn / rate) * 100) / 100
  if (usd <= 0) usd = 0.01

  let iterations = 0
  while (
    computePreviewLocalPayIn({
      amountEntryMode: "usd",
      enteredAmount: usd,
      customerSellRate: rate,
    }) < input.minLocalPayIn &&
    iterations < MAX_USD_BUMP_ITERATIONS
  ) {
    usd = Math.round((usd + 0.01) * 100) / 100
    iterations += 1
  }

  return usd
}

export const YC_PAY_IN_MIN_ENFORCE_DEBOUNCE_MS = 3000
