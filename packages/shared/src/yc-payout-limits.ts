import type { PayoutRail } from "./payout-corridor"
import { formatMoneyDisplay } from "./format-money-display"
import { normalizePayoutReceiveAmountForCurrency } from "./noah-send-rates"
import { parseYcChannelPayInLimits } from "./yc-pay-in-limits"

/** YC direct-settlement disbursement requires cryptoAmount strictly above 1 USD. */
export const YC_DIRECT_SETTLEMENT_MIN_SEND_USDC_EXCLUSIVE = 1.01

export type YcPayoutLimits = {
  minSendUsd: number
  minLocalReceive: number | null
  maxLocalReceive: number | null
}

/** Published send limits — fallback when channel omits min/max. */
const YC_SEND_LIMITS_FALLBACK: Record<string, { min?: number; max?: number }> = {
  "NG:NGN:bank_transfer": { min: 2000, max: 30_000_000 },
  "NG:NGN:mobile_money": { min: 2000, max: 30_000_000 },
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

/**
 * Easner minimum receive amounts for YC balance payouts (bank + mobile money).
 * Separate from Noah policy in payout-business-limits.ts — YC corridors can differ.
 */
const YC_PAYOUT_BUSINESS_MIN_BANK: Record<string, number> = {
  NGN: 2000,
  KES: 500,
  RWF: 6000,
  ZAR: 200,
  TZS: 2500,
  UGX: 15_000,
  ZMW: 50_000,
}

const YC_PAYOUT_BUSINESS_MIN_MOBILE: Record<string, number> = {
  NGN: 2000,
  KES: 500,
  RWF: 6000,
  ZAR: 200,
  TZS: 2500,
  UGX: 15_000,
  ZMW: 100,
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
  return `${country.trim().toUpperCase()}:${currency.trim().toUpperCase()}:${rail}`
}

export function resolveYcPayoutLimits(input: {
  country: string
  currency: string
  rail: PayoutRail
  channel?: Record<string, unknown> | null
}): YcPayoutLimits {
  const fromChannel = parseYcChannelPayInLimits(input.channel)
  const fallback = YC_SEND_LIMITS_FALLBACK[corridorLimitKey(input.country, input.currency, input.rail)]
  return {
    minSendUsd: YC_DIRECT_SETTLEMENT_MIN_SEND_USDC_EXCLUSIVE,
    minLocalReceive: fromChannel.minLocalPayIn ?? fallback?.min ?? null,
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
