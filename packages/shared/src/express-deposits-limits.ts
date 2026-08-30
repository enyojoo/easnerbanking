import { formatMoneyDisplay } from "./format-money-display"
import { expressDepositsSourceCurrency } from "./stripe-onramp-geo"

/** Floor on USD credited (amount field). */
export const EXPRESS_DEPOSITS_MIN_USD_CREDIT = 1

/**
 * EU Travel Rule kicks in at €1,000 you pay. We keep pay-in strictly below that
 * until wallet-ownership confirmation is built.
 */
export const EXPRESS_DEPOSITS_EU_TRAVEL_RULE_EUR = 1000
export const EXPRESS_DEPOSITS_EU_MAX_YOU_PAY_EUR = 999.99

export type ExpressDepositsAmountValidation = { ok: true } | { ok: false; message: string; code: string }

export type ExpressDepositsAmountEntryMode = "usd" | "pay"

export function parseExpressDepositsAmountEntryMode(
  raw?: string | null,
): ExpressDepositsAmountEntryMode {
  return String(raw || "").trim().toLowerCase() === "pay" ? "pay" : "usd"
}

/** Send/local receive switch: only when they pay a different currency than USD credit. */
export function expressDepositsShowAmountToggle(sourceCurrency?: string | null): boolean {
  return String(sourceCurrency || "").trim().toUpperCase() === "EUR"
}

/** Pay currency for the amount field: live quote, then status, then payer country. */
export function resolveExpressDepositsPayCurrency(input: {
  quoted?: string | null
  status?: string | null
  payerCountry?: string | null
}): string {
  const quoted = String(input.quoted || "").trim().toUpperCase()
  if (quoted === "EUR" || quoted === "USD") return quoted
  const status = String(input.status || "").trim().toUpperCase()
  if (status === "EUR" || status === "USD") return status
  return expressDepositsSourceCurrency(input.payerCountry)?.toUpperCase() || "USD"
}

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
  amountEntryMode?: ExpressDepositsAmountEntryMode | string | null
}): ExpressDepositsAmountValidation {
  const mode = parseExpressDepositsAmountEntryMode(input.amountEntryMode)
  const usd = Number(input.usdCredit)
  const youPay = Number(input.youPay)
  const source = String(input.sourceCurrency || "").trim().toUpperCase()
  const limits = expressDepositsLimits(input.sourceCurrency)

  if (mode === "pay") {
    if (!Number.isFinite(youPay) || youPay <= 0) {
      return { ok: false, message: "Enter a valid amount", code: "invalid_amount" }
    }
    if (source === "EUR" && youPay >= EXPRESS_DEPOSITS_EU_TRAVEL_RULE_EUR) {
      return {
        ok: false,
        message: `Maximum deposit is ${formatMoneyDisplay(EXPRESS_DEPOSITS_EU_MAX_YOU_PAY_EUR, "EUR")}.`,
        code: "max_amount_exceeded",
      }
    }
    if (Number.isFinite(usd) && usd > 0 && usd < limits.minUsdCredit) {
      return {
        ok: false,
        message: `Minimum deposit is ${formatMoneyDisplay(limits.minUsdCredit, "USD")}.`,
        code: "min_amount_not_met",
      }
    }
    return { ok: true }
  }

  if (!Number.isFinite(usd) || usd <= 0) {
    return { ok: false, message: "Enter a valid amount", code: "invalid_amount" }
  }
  if (usd < limits.minUsdCredit) {
    return {
      ok: false,
      message: `Minimum deposit is ${formatMoneyDisplay(limits.minUsdCredit, "USD")}.`,
      code: "min_amount_not_met",
    }
  }
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
export function nextExpressDepositsEnteredAmount(input: {
  amountEntryMode?: ExpressDepositsAmountEntryMode | string | null
  enteredAmount: number
  usdCredit: number
  youPay?: number | null
  sourceCurrency?: string | null
}): number | null {
  const mode = parseExpressDepositsAmountEntryMode(input.amountEntryMode)
  const entered = Number(input.enteredAmount)
  if (!Number.isFinite(entered) || entered <= 0) return null
  const check = validateExpressDepositsAmount({
    usdCredit: input.usdCredit,
    youPay: mode === "pay" ? entered : input.youPay,
    sourceCurrency: input.sourceCurrency,
    amountEntryMode: mode,
  })
  if (check.ok) return null
  if (mode === "pay") {
    if (check.code === "max_amount_exceeded") return EXPRESS_DEPOSITS_EU_MAX_YOU_PAY_EUR
    if (check.code === "min_amount_not_met") {
      const usd = Number(input.usdCredit)
      if (usd > 0 && entered > 0) {
        const scaled = Math.ceil((entered * EXPRESS_DEPOSITS_MIN_USD_CREDIT) / usd * 100) / 100
        if (scaled > entered) return Math.min(scaled, EXPRESS_DEPOSITS_EU_MAX_YOU_PAY_EUR)
      }
    }
    return null
  }
  return nextExpressDepositsUsdCredit({
    usdCredit: entered,
    youPay: input.youPay,
    sourceCurrency: input.sourceCurrency,
  })
}

/** Next USD-credit field value when send-style min bump / max clamp should rewrite the input. */
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
