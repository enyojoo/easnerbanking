import type { PayoutRail } from "./payout-corridor"
import { formatMoneyDisplay } from "./format-money-display"

export type YcPayInRail = PayoutRail

export type YcPayInLimits = {
  minLocalPayIn: number | null
  maxLocalPayIn: number | null
}

/** YC published receive limits — fallback when channel object omits min/max. */
const YC_RECEIVE_LIMITS_FALLBACK: Record<string, { min: number; max?: number }> = {
  "NG:NGN:bank_transfer": { min: 2500, max: 30_000_000 },
  "NG:NGN:mobile_money": { min: 2500, max: 30_000_000 },
  "KE:KES:bank_transfer": { min: 500, max: 999_999 },
  "KE:KES:mobile_money": { min: 500, max: 250_000 },
  "RW:RWF:bank_transfer": { min: 1500, max: 10_000_000 },
  "RW:RWF:mobile_money": { min: 1500, max: 10_000_000 },
  "ZA:ZAR:bank_transfer": { min: 200, max: 500_000 },
  "TZ:TZS:bank_transfer": { min: 2500, max: 150_000_000 },
  "TZ:TZS:mobile_money": { min: 2500, max: 10_000_000 },
  "UG:UGX:bank_transfer": { min: 15_000, max: 36_000_000 },
  "UG:UGX:mobile_money": { min: 15_000, max: 3_000_000 },
  "ZM:ZMW:bank_transfer": { min: 50_000, max: 15_000_000 },
  "ZM:ZMW:mobile_money": { min: 100, max: 20_000 },
}

function corridorLimitKey(country: string, currency: string, rail: YcPayInRail): string {
  return `${country.trim().toUpperCase()}:${currency.trim().toUpperCase()}:${rail}`
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
  const fallback = YC_RECEIVE_LIMITS_FALLBACK[corridorLimitKey(input.country, input.currency, input.rail)]

  return {
    minLocalPayIn: fromChannel.minLocalPayIn ?? fallback?.min ?? null,
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
