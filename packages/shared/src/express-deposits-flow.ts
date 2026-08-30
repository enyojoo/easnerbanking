import { isExpressCashKind, type ExpressCashKind } from "./cash-pay-in-methods"
import { EXPRESS_DEPOSITS_COPY, expressDepositMethodTitle } from "./express-deposits-copy"
import { parseExpressDepositsAmountEntryMode } from "./express-deposits-limits"
import type { ExpressDepositsPricingBreakdown } from "./express-deposits-pricing"

export type ExpressDepositsPaymentMethod = "card" | "apple_pay" | "google_pay" | "ach"

export type ExpressDepositFlowStep = "setup" | "review"

export type ExpressDepositPayErrorKind = "kyc" | "wrong_token" | "failed"

export type ExpressSavedPaymentRail = "card" | "ach"

export type ExpressSavedInstrument = {
  paymentTokenId: string
  last4?: string | null
  brand?: string | null
  bankName?: string | null
}

export type ExpressSavedPaymentMethods = {
  card?: ExpressSavedInstrument | null
  ach?: ExpressSavedInstrument | null
}

export type ExpressDepositFlowParams = {
  method: ExpressCashKind
  usdCredit: number
  pricing: ExpressDepositsPricingBreakdown
  paymentMethods?: ExpressSavedPaymentMethods
  paymentTokenId?: string | null
  forceCollect?: boolean
}

export function expressCashKindToPaymentMethod(kind: ExpressCashKind): ExpressDepositsPaymentMethod {
  if (kind === "express_ach") return "ach"
  if (kind === "express_apple_pay") return "apple_pay"
  if (kind === "express_google_pay") return "google_pay"
  return "card"
}

export function isExpressWalletKind(kind: ExpressCashKind): boolean {
  return kind === "express_apple_pay" || kind === "express_google_pay"
}

export function expressSavedPaymentRail(kind: ExpressCashKind): ExpressSavedPaymentRail | null {
  if (kind === "express_ach") return "ach"
  if (kind === "express_card") return "card"
  return null
}

function readLast4(value: unknown): string | null {
  const digits = String(value || "").replace(/\D/g, "")
  return digits.length >= 4 ? digits.slice(-4) : digits || null
}

export function parseExpressSavedInstrument(raw: unknown): ExpressSavedInstrument | null {
  if (!raw || typeof raw !== "object") return null
  const row = raw as Record<string, unknown>
  const paymentTokenId = String(row.paymentTokenId || "").trim()
  if (!paymentTokenId) return null
  return {
    paymentTokenId,
    last4: readLast4(row.last4),
    brand: String(row.brand || "").trim() || null,
    bankName: String(row.bankName || "").trim() || null,
  }
}

export function parseExpressSavedPaymentMethods(raw: unknown): ExpressSavedPaymentMethods {
  if (!raw || typeof raw !== "object") return {}
  const row = raw as Record<string, unknown>
  return {
    card: parseExpressSavedInstrument(row.card) ?? null,
    ach: parseExpressSavedInstrument(row.ach) ?? null,
  }
}

export function mergeExpressSavedPaymentMethods(
  current: ExpressSavedPaymentMethods | null | undefined,
  rail: ExpressSavedPaymentRail,
  instrument: ExpressSavedInstrument,
): ExpressSavedPaymentMethods {
  const next = parseExpressSavedPaymentMethods(current)
  if (rail === "ach") return { ...next, ach: instrument }
  return { ...next, card: instrument }
}

export function expressSavedInstrumentForMethod(
  methods: ExpressSavedPaymentMethods | null | undefined,
  kind: ExpressCashKind,
): ExpressSavedInstrument | null {
  const rail = expressSavedPaymentRail(kind)
  if (!rail) return null
  const parsed = parseExpressSavedPaymentMethods(methods)
  return (rail === "ach" ? parsed.ach : parsed.card) ?? null
}

export function coalesceExpressSavedPaymentMethods(
  ...sources: Array<ExpressSavedPaymentMethods | null | undefined>
): ExpressSavedPaymentMethods {
  const out: ExpressSavedPaymentMethods = {}
  for (const source of sources) {
    const parsed = parseExpressSavedPaymentMethods(source)
    if (!out.card && parsed.card) out.card = parsed.card
    if (!out.ach && parsed.ach) out.ach = parsed.ach
  }
  return out
}

export function expressReviewDepositMethodLabel(input: {
  method: ExpressCashKind
  paymentMethods?: ExpressSavedPaymentMethods | null
}): string {
  return expressPaymentMethodDisplayForMethod(input).accessibilityLabel
}

function titleCaseInstrumentName(value?: string | null): string {
  const raw = String(value || "").trim().replace(/[_-]+/g, " ")
  if (!raw) return ""
  return raw.replace(/\b\w/g, (ch) => ch.toUpperCase())
}

export function formatExpressSavedInstrumentLabel(input: {
  rail: ExpressSavedPaymentRail
  last4?: string | null
  brand?: string | null
  bankName?: string | null
}): string {
  const last4 = readLast4(input.last4)
  const dots = last4 ? `····${last4}` : ""
  if (input.rail === "card") {
    const brand = titleCaseInstrumentName(input.brand)
    if (brand && dots) return `${brand} ${dots}`
    if (dots) return `${EXPRESS_DEPOSITS_COPY.cardTitle} ${dots}`
    return EXPRESS_DEPOSITS_COPY.cardTitle
  }
  const bank = String(input.bankName || "").trim()
  if (bank && dots) return `${bank} ${dots}`
  if (dots) return `US bank ${dots}`
  return "US bank"
}

export type ExpressPaymentBrandIconKey =
  | "visa"
  | "mastercard"
  | "amex"
  | "discover"
  | "link"
  | "apple_pay"
  | "google_pay"
  | "bank"
  | "card"

export type ExpressPaymentMethodDisplay = {
  iconKey: ExpressPaymentBrandIconKey
  /** Visible text beside the brand chip (last4 mask or wallet name). */
  text: string
  /** Full label for accessibility and plain-text fallbacks. */
  accessibilityLabel: string
}

function expressCardBrandIconKey(brand?: string | null): ExpressPaymentBrandIconKey {
  const normalized = String(brand || "").trim().toLowerCase()
  if (normalized === "visa") return "visa"
  if (normalized === "mastercard" || normalized === "master_card") return "mastercard"
  if (normalized === "amex" || normalized === "american_express") return "amex"
  if (normalized === "discover") return "discover"
  if (normalized === "link") return "link"
  return "card"
}

function expressPaymentLast4Mask(last4?: string | null): string | null {
  const digits = readLast4(last4)
  return digits ? `•••• ${digits}` : null
}

export function expressPaymentMethodDisplayForMethod(input: {
  method: ExpressCashKind
  paymentMethods?: ExpressSavedPaymentMethods | null
}): ExpressPaymentMethodDisplay {
  if (input.method === "express_apple_pay") {
    return {
      iconKey: "apple_pay",
      text: EXPRESS_DEPOSITS_COPY.applePayTitle,
      accessibilityLabel: EXPRESS_DEPOSITS_COPY.applePayTitle,
    }
  }
  if (input.method === "express_google_pay") {
    return {
      iconKey: "google_pay",
      text: EXPRESS_DEPOSITS_COPY.googlePayTitle,
      accessibilityLabel: EXPRESS_DEPOSITS_COPY.googlePayTitle,
    }
  }
  const rail = expressSavedPaymentRail(input.method)
  const instrument = expressSavedInstrumentForMethod(input.paymentMethods, input.method)
  if (rail === "ach") {
    const mask = expressPaymentLast4Mask(instrument?.last4)
    const bank = String(instrument?.bankName || "").trim()
    return {
      iconKey: "bank",
      text: mask ?? bank ?? EXPRESS_DEPOSITS_COPY.achTitle,
      accessibilityLabel: formatExpressSavedInstrumentLabel({
        rail: "ach",
        last4: instrument?.last4,
        bankName: instrument?.bankName,
      }),
    }
  }
  const mask = expressPaymentLast4Mask(instrument?.last4)
  return {
    iconKey: expressCardBrandIconKey(instrument?.brand),
    text: mask ?? EXPRESS_DEPOSITS_COPY.cardTitle,
    accessibilityLabel: formatExpressSavedInstrumentLabel({
      rail: "card",
      last4: instrument?.last4,
      brand: instrument?.brand,
    }),
  }
}

export function expressPaymentMethodDisplayFromReview(input: {
  paymentMethod?: string | null
  brand?: string | null
  last4?: string | null
  bankName?: string | null
}): ExpressPaymentMethodDisplay | null {
  const method = String(input.paymentMethod || "").trim().toLowerCase()
  if (!method) return null
  if (method === "apple_pay") {
    return {
      iconKey: "apple_pay",
      text: EXPRESS_DEPOSITS_COPY.applePayTitle,
      accessibilityLabel: EXPRESS_DEPOSITS_COPY.applePayTitle,
    }
  }
  if (method === "google_pay") {
    return {
      iconKey: "google_pay",
      text: EXPRESS_DEPOSITS_COPY.googlePayTitle,
      accessibilityLabel: EXPRESS_DEPOSITS_COPY.googlePayTitle,
    }
  }
  if (method === "ach") {
    const mask = expressPaymentLast4Mask(input.last4)
    const bank = String(input.bankName || "").trim()
    return {
      iconKey: "bank",
      text: mask ?? bank ?? EXPRESS_DEPOSITS_COPY.achTitle,
      accessibilityLabel: formatExpressSavedInstrumentLabel({
        rail: "ach",
        last4: input.last4,
        bankName: input.bankName,
      }),
    }
  }
  if (method === "card") {
    const mask = expressPaymentLast4Mask(input.last4)
    return {
      iconKey: expressCardBrandIconKey(input.brand),
      text: mask ?? EXPRESS_DEPOSITS_COPY.cardTitle,
      accessibilityLabel: formatExpressSavedInstrumentLabel({
        rail: "card",
        last4: input.last4,
        brand: input.brand,
      }),
    }
  }
  return null
}

export function expressInstrumentFromCollectDetails(
  details?: Record<string, unknown> | null,
): Pick<ExpressSavedInstrument, "last4" | "brand" | "bankName"> {
  if (!details || typeof details !== "object") return {}
  const card = details.card && typeof details.card === "object" ? (details.card as Record<string, unknown>) : null
  const bank =
    details.us_bank_account && typeof details.us_bank_account === "object"
      ? (details.us_bank_account as Record<string, unknown>)
      : details.bankAccount && typeof details.bankAccount === "object"
        ? (details.bankAccount as Record<string, unknown>)
        : null
  return {
    last4: readLast4(card?.last4 ?? bank?.last4 ?? details.last4),
    brand: String(card?.brand || details.brand || "").trim() || null,
    bankName: String(bank?.bank_name || bank?.bankName || details.bankName || "").trim() || null,
  }
}

export function nextExpressDepositStep(input: {
  method: ExpressCashKind
  paymentMethods?: ExpressSavedPaymentMethods | null
  forceCollect?: boolean
}): ExpressDepositFlowStep {
  if (isExpressWalletKind(input.method)) return "review"
  if (input.forceCollect) return "setup"
  const instrument = expressSavedInstrumentForMethod(input.paymentMethods, input.method)
  if (instrument?.paymentTokenId) return "review"
  return "setup"
}

export function expressSavedPaymentTokenForMethod(input: {
  method: ExpressCashKind
  paymentMethods?: ExpressSavedPaymentMethods | null
  paymentTokenId?: string | null
}): string | null {
  const direct = String(input.paymentTokenId || "").trim()
  if (direct) return direct
  return expressSavedInstrumentForMethod(input.paymentMethods, input.method)?.paymentTokenId ?? null
}

export function expressDepositPayNeedsCollect(input: {
  method: ExpressCashKind
  paymentMethods?: ExpressSavedPaymentMethods | null
  paymentTokenId?: string | null
}): boolean {
  if (isExpressWalletKind(input.method)) return true
  return !expressSavedPaymentTokenForMethod(input)
}

export function expressDepositCollectPaymentOpts(input: {
  method: ExpressCashKind
  amount?: number | null
  currency?: string | null
}): Record<string, unknown> {
  const wallets = {
    applePay: input.method === "express_apple_pay" ? "auto" : "never",
    googlePay: input.method === "express_google_pay" ? "auto" : "never",
  }
  const opts: Record<string, unknown> = {
    payment_method_types: input.method === "express_ach" ? ["us_bank_account"] : ["card"],
    wallets,
  }
  if (isExpressWalletKind(input.method)) {
    const amount = Number(input.amount)
    const currency = String(input.currency || "").trim().toUpperCase()
    if (Number.isFinite(amount) && amount > 0 && currency) {
      opts.amount = amount
      opts.currency = currency
    }
  }
  return opts
}

export function expressDepositCheckoutMandateData(
  method: ExpressCashKind,
): { customer_acceptance: { type: "online" } } | undefined {
  if (method !== "express_ach") return undefined
  return { customer_acceptance: { type: "online" } }
}

export function parseExpressDepositsPricing(raw: unknown): ExpressDepositsPricingBreakdown | null {
  if (!raw || typeof raw !== "object") return null
  const row = raw as Partial<ExpressDepositsPricingBreakdown>
  const usdCredit = Number(row.usdCredit)
  const totalToPay = Number(row.totalToPay)
  const sourceCurrency = String(row.sourceCurrency || "").trim().toUpperCase()
  if (!(usdCredit > 0) || !(totalToPay > 0) || !sourceCurrency) return null
  const fees = row.stripeFees
  return {
    usdCredit,
    sourceCurrency,
    stripeSourceTotal: Number(row.stripeSourceTotal) || 0,
    stripeFees: {
      transaction: Number(fees?.transaction) || 0,
      network: Number(fees?.network) || 0,
      total: Number(fees?.total) || 0,
    },
    easnerProcessingFeeUsd: Number(row.easnerProcessingFeeUsd) || 0,
    easnerProcessingFeeDisplay: Number(row.easnerProcessingFeeDisplay) || 0,
    displayProcessingFee: Number(row.displayProcessingFee) || 0,
    totalToPay,
    exchangeRate:
      row.exchangeRate && Number(row.exchangeRate.rate) > 0
        ? {
            from: String(row.exchangeRate.from || "USD"),
            to: String(row.exchangeRate.to || sourceCurrency),
            rate: Number(row.exchangeRate.rate),
          }
        : undefined,
    rateFetchedAt:
      row.rateFetchedAt == null || !Number.isFinite(Number(row.rateFetchedAt))
        ? null
        : Number(row.rateFetchedAt),
    amountEntryMode: parseExpressDepositsAmountEntryMode(row.amountEntryMode),
    quotedAmount: Number(row.quotedAmount) > 0 ? Number(row.quotedAmount) : usdCredit,
    stripeSourceAmount: Number(row.stripeSourceAmount) > 0 ? Number(row.stripeSourceAmount) : undefined,
  }
}

export function parseExpressDepositFlowParams(raw: unknown): ExpressDepositFlowParams | null {
  if (!raw || typeof raw !== "object") return null
  const row = raw as Record<string, unknown>
  const method = String(row.method || "")
  if (!isExpressCashKind(method)) return null
  const usdCredit = Number(row.usdCredit)
  const pricing = parseExpressDepositsPricing(row.pricing)
  if (!(usdCredit > 0) || !pricing) return null
  const paymentMethods = parseExpressSavedPaymentMethods(row.paymentMethods)
  const instrument = expressSavedInstrumentForMethod(paymentMethods, method)
  return {
    method,
    usdCredit,
    pricing,
    paymentMethods,
    paymentTokenId: instrument?.paymentTokenId ?? undefined,
    forceCollect: row.forceCollect === true,
  }
}

const EXPRESS_DEPOSIT_WRONG_TOKEN_CODES = [
  "crypto_onramp_invalid_payment_token",
  "crypto_onramp_invalid_payment_method",
  "payment_token_invalid",
  "invalid_payment_token",
  "payment_method_invalid",
] as const

export function classifyExpressDepositPayError(
  code?: string | null,
  message?: string | null,
): ExpressDepositPayErrorKind {
  const codeHay = String(code || "").toLowerCase()
  const messageHay = String(message || "").toLowerCase()
  const hay = `${codeHay} ${messageHay}`
  if (
    hay.includes("missing_document") ||
    hay.includes("missing_minimum_identity") ||
    hay.includes("missing_identity") ||
    /\bidentity\b/.test(hay)
  ) {
    return "kyc"
  }
  if (EXPRESS_DEPOSIT_WRONG_TOKEN_CODES.some((tokenCode) => codeHay.includes(tokenCode))) {
    return "wrong_token"
  }
  if (/invalid.*payment_token/.test(hay) || /payment_token.*invalid/.test(hay)) {
    return "wrong_token"
  }
  if (/wrong type.*us_bank_account/.test(hay) || /expected.*us_bank_account/.test(hay)) {
    return "wrong_token"
  }
  return "failed"
}
