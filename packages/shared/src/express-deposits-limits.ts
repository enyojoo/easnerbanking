import { formatMoneyDisplay } from "./format-money-display"

/** Floor on USD credited (amount field). */
export const EXPRESS_DEPOSITS_MIN_USD_CREDIT = 1

/**
 * EU Travel Rule kicks in at €1,000 you pay. We keep pay-in strictly below that
 * until wallet-ownership confirmation is built.
 */
export const EXPRESS_DEPOSITS_EU_TRAVEL_RULE_EUR = 1000
export const EXPRESS_DEPOSITS_EU_MAX_YOU_PAY_EUR = 999.99

export type ExpressDepositsAmountValidation = { ok: true } | { ok: false; message: string; code: string }

export function expressDepositsLimits(sourceCurrency: string | null | undefined): {
  minUsdCredit: number
  maxYouPay: number | null
  maxYouPayCurrency: string | null
} {
  const source = String(sourceCurrency || "").trim().toUpperCase()
  if (source === "EUR") {
    return {
      minUsdCredit: EXPRESS_DEPOSITS_MIN_USD_CREDIT,
      maxYouPay: EXPRESS_DEPOSITS_EU_MAX_YOU_PAY_EUR,
      maxYouPayCurrency: "EUR",
    }
  }
  return {
    minUsdCredit: EXPRESS_DEPOSITS_MIN_USD_CREDIT,
    maxYouPay: null,
    maxYouPayCurrency: null,
  }
}

export function validateExpressDepositsAmount(input: {
  usdCredit: number
  youPay?: number | null
  sourceCurrency?: string | null
}): ExpressDepositsAmountValidation {
  const usd = Number(input.usdCredit)
  if (!Number.isFinite(usd) || usd <= 0) {
    return { ok: false, message: "Enter a valid amount", code: "invalid_amount" }
  }
  const limits = expressDepositsLimits(input.sourceCurrency)
  if (usd < limits.minUsdCredit) {
    return {
      ok: false,
      message: `Minimum deposit is ${formatMoneyDisplay(limits.minUsdCredit, "USD")}.`,
      code: "min_amount_not_met",
    }
  }

  const youPay = Number(input.youPay)
  const source = String(input.sourceCurrency || "").trim().toUpperCase()
  if (source === "EUR") {
    if (Number.isFinite(youPay) && youPay >= EXPRESS_DEPOSITS_EU_TRAVEL_RULE_EUR) {
      return {
        ok: false,
        message: `Maximum deposit is ${formatMoneyDisplay(EXPRESS_DEPOSITS_EU_MAX_YOU_PAY_EUR, "EUR")}.`,
        code: "max_amount_exceeded",
      }
    }
    if ((!Number.isFinite(youPay) || youPay <= 0) && usd >= EXPRESS_DEPOSITS_EU_TRAVEL_RULE_EUR) {
      return {
        ok: false,
        message: `Maximum deposit is ${formatMoneyDisplay(EXPRESS_DEPOSITS_EU_MAX_YOU_PAY_EUR, "EUR")}.`,
        code: "max_amount_exceeded",
      }
    }
  }

  return { ok: true }
}

/** Next amount-field value when send-style min bump / max clamp should rewrite the input. */
export function nextExpressDepositsUsdCredit(input: {
  usdCredit: number
  youPay?: number | null
  sourceCurrency?: string | null
}): number | null {
  const usd = Number(input.usdCredit)
  if (!Number.isFinite(usd) || usd <= 0) return null
  const check = validateExpressDepositsAmount(input)
  if (check.ok) return null
  if (check.code === "min_amount_not_met") return EXPRESS_DEPOSITS_MIN_USD_CREDIT
  if (check.code !== "max_amount_exceeded") return null

  const youPay = Number(input.youPay)
  if (Number.isFinite(youPay) && youPay > EXPRESS_DEPOSITS_EU_MAX_YOU_PAY_EUR) {
    const scaled = Math.floor(((usd * EXPRESS_DEPOSITS_EU_MAX_YOU_PAY_EUR) / youPay) * 100) / 100
    const next = Math.max(EXPRESS_DEPOSITS_MIN_USD_CREDIT, scaled)
    if (next < usd) return next
    return Math.max(EXPRESS_DEPOSITS_MIN_USD_CREDIT, Math.round((usd - 0.01) * 100) / 100)
  }
  return Math.min(usd, EXPRESS_DEPOSITS_EU_MAX_YOU_PAY_EUR)
}
