/**
 * Express deposits pricing (buyer pays).
 *
 * Stripe on-ramp session create accepts `destination_amount` OR `source_amount`, not both.
 * We anchor on `destination_amount = usdCredit` so the customer receives the full USD credit.
 * Stripe derives `source_total_amount` from the quote; Easner pay-in bps stacks on top for
 * display and ledger `totalToPay`. When pay-in bps > 0, pass `source_amount: totalToPay` on
 * session create only if Stripe accepts it alongside destination (sandbox-validated); otherwise
 * destination-only session still credits full usdCredit and Easner leg is ledger/display until
 * Stripe confirms a markup path.
 */

import { expressDepositMethodTitle } from "./express-deposits-copy"
import {
  parseExpressDepositsAmountEntryMode,
  type ExpressDepositsAmountEntryMode,
} from "./express-deposits-limits"
import { formatReviewRowMoneyDisplay } from "./format-review-row-money"
import { formatSendRateLabel } from "./format-exchange-rate"
import {
  computeDisplayProcessingFee,
  computePayoutProcessingFeeBps,
} from "./payout-processing-fee"
import { isPayoutReviewFeeVisible } from "./payout-review-display"
import { REVIEW_ROW_LABELS } from "./review-row-labels"

export type ExpressDepositsStripeQuoteFees = {
  transaction: number
  network: number
  total: number
}

export type ExpressSolanaUsdcQuote = {
  destination_currency?: string
  destination_amount?: string
  source_total_amount?: string
  source_amount?: string
  fees?: {
    transaction_fee_monetary?: string
    network_fee_monetary?: string
  }
}

export type ExpressDepositsPricingBreakdown = {
  usdCredit: number
  sourceCurrency: string
  stripeSourceTotal: number
  stripeFees: ExpressDepositsStripeQuoteFees
  easnerProcessingFeeUsd: number
  easnerProcessingFeeDisplay: number
  displayProcessingFee: number
  totalToPay: number
  exchangeRate?: { from: string; to: string; rate: number }
  rateFetchedAt?: number | null
  amountEntryMode?: ExpressDepositsAmountEntryMode
  quotedAmount?: number
  stripeSourceAmount?: number
}

export type ExpressDepositsReviewRow = {
  id: string
  label: string
  value: string
  valueBold?: boolean
}

function roundMoney(n: number): number {
  if (!Number.isFinite(n)) return 0
  return Math.round(n * 100) / 100
}

function positive(n: unknown): number | null {
  const v = Number(n)
  return Number.isFinite(v) && v > 0 ? v : null
}

export function pickExpressSolanaUsdcQuote(raw: unknown): ExpressSolanaUsdcQuote | null {
  if (!raw || typeof raw !== "object") return null
  const row = raw as {
    destination_network_quotes?: Record<string, ExpressSolanaUsdcQuote[] | undefined>
    destination_amount?: string
    source_total_amount?: string
    source_amount?: string
    fees?: ExpressSolanaUsdcQuote["fees"]
  }
  const solana = row.destination_network_quotes?.solana ?? []
  const usdc =
    solana.find((q) => String(q.destination_currency ?? "").toLowerCase() === "usdc") ??
    solana[0] ??
    null
  if (usdc) return usdc
  if (row.source_total_amount || row.destination_amount) {
    return {
      destination_amount: row.destination_amount,
      source_total_amount: row.source_total_amount,
      source_amount: row.source_amount,
      fees: row.fees,
    }
  }
  return null
}

export function parseExpressStripeQuoteFees(
  quote: ExpressSolanaUsdcQuote | null,
  sourceTotal: number,
): ExpressDepositsStripeQuoteFees {
  const transaction = positive(quote?.fees?.transaction_fee_monetary) ?? 0
  const network = positive(quote?.fees?.network_fee_monetary) ?? 0
  const fromFields = roundMoney(transaction + network)
  if (fromFields > 0) {
    return { transaction: roundMoney(transaction), network: roundMoney(network), total: fromFields }
  }
  const sourceAmount = positive(quote?.source_amount) ?? 0
  const inferred =
    sourceTotal > 0 && sourceAmount > 0 ? roundMoney(Math.max(0, sourceTotal - sourceAmount)) : 0
  return { transaction: inferred, network: 0, total: inferred }
}

function convertUsdFeeToPayCurrency(
  feeUsd: number,
  usdCredit: number,
  stripeSourceTotal: number,
): number {
  if (!(feeUsd > 0)) return 0
  if (!(usdCredit > 0) || !(stripeSourceTotal > 0)) return roundMoney(feeUsd)
  return roundMoney(feeUsd * (stripeSourceTotal / usdCredit))
}

export function expressDepositsOnrampQuoteLock(input: {
  amountEntryMode?: ExpressDepositsAmountEntryMode | string | null
  usdCredit?: number | null
  youPay?: number | null
}): { destination_amount: string } | { source_amount: string } | null {
  const mode = parseExpressDepositsAmountEntryMode(input.amountEntryMode)
  const youPay = Number(input.youPay)
  const usdCredit = Number(input.usdCredit)
  if (mode === "pay") {
    return Number.isFinite(youPay) && youPay > 0 ? { source_amount: String(youPay) } : null
  }
  return Number.isFinite(usdCredit) && usdCredit > 0 ? { destination_amount: String(usdCredit) } : null
}

export function expressDepositsQuoteMatchesEntered(input: {
  pricing?: ExpressDepositsPricingBreakdown | null
  amountEntryMode?: ExpressDepositsAmountEntryMode | string | null
  enteredAmount: number
}): boolean {
  const pricing = input.pricing
  const entered = Number(input.enteredAmount)
  if (!pricing || !(entered > 0)) return false
  const mode = parseExpressDepositsAmountEntryMode(input.amountEntryMode)
  if (parseExpressDepositsAmountEntryMode(pricing.amountEntryMode) !== mode) return false
  const quoted = Number(pricing.quotedAmount)
  const fallback = mode === "pay" ? pricing.totalToPay : pricing.usdCredit
  const target = Number.isFinite(quoted) && quoted > 0 ? quoted : fallback
  return Math.round(target * 100) === Math.round(entered * 100)
}

export function buildExpressDepositsPricing(input: {
  usdCredit: number
  sourceCurrency: string
  stripeQuote: ExpressSolanaUsdcQuote | null
  payInBps: number
  rateFetchedAt?: number | null
  amountEntryMode?: ExpressDepositsAmountEntryMode | string | null
  quotedAmount?: number | null
}): ExpressDepositsPricingBreakdown | null {
  const quotedDestination = positive(input.stripeQuote?.destination_amount)
  const usdCredit = quotedDestination ?? roundMoney(input.usdCredit)
  if (!(usdCredit > 0)) return null

  const sourceCurrency = String(input.sourceCurrency || "USD").trim().toUpperCase() || "USD"
  const stripeSourceTotal =
    positive(input.stripeQuote?.source_total_amount) ??
    positive((input.stripeQuote as { source_total_amount?: string } | null)?.source_total_amount) ??
    null
  if (stripeSourceTotal == null) return null

  const stripeFees = parseExpressStripeQuoteFees(input.stripeQuote, stripeSourceTotal)
  const easnerProcessingFeeUsd = roundMoney(
    computePayoutProcessingFeeBps(usdCredit, { bps: input.payInBps }),
  )
  const easnerProcessingFeeDisplay =
    sourceCurrency === "USD"
      ? easnerProcessingFeeUsd
      : convertUsdFeeToPayCurrency(easnerProcessingFeeUsd, usdCredit, stripeSourceTotal)

  const stripeFeesInPayCurrency =
    sourceCurrency === "USD"
      ? stripeFees.total
      : convertUsdFeeToPayCurrency(stripeFees.total, usdCredit, stripeSourceTotal)

  const displayProcessingFee = roundMoney(
    computeDisplayProcessingFee({
      processingFee: easnerProcessingFeeDisplay,
      exchangeFee: stripeFeesInPayCurrency,
    }),
  )
  const totalToPay = roundMoney(stripeSourceTotal + easnerProcessingFeeDisplay)

  let exchangeRate: ExpressDepositsPricingBreakdown["exchangeRate"]
  if (sourceCurrency !== "USD" && usdCredit > 0) {
    const principal = positive(input.stripeQuote?.source_amount) ?? stripeSourceTotal - stripeFees.total
    if (principal != null && principal > 0) {
      exchangeRate = { from: "USD", to: sourceCurrency, rate: roundMoney(principal / usdCredit) }
    }
  }

  const amountEntryMode = parseExpressDepositsAmountEntryMode(input.amountEntryMode)
  const stripeSourceAmount = positive(input.stripeQuote?.source_amount)
  const quotedAmount = positive(input.quotedAmount) ?? (amountEntryMode === "pay" ? stripeSourceAmount : usdCredit)

  return {
    usdCredit,
    sourceCurrency,
    stripeSourceTotal: roundMoney(stripeSourceTotal),
    stripeFees,
    easnerProcessingFeeUsd,
    easnerProcessingFeeDisplay,
    displayProcessingFee,
    totalToPay,
    exchangeRate,
    rateFetchedAt: input.rateFetchedAt ?? null,
    amountEntryMode,
    quotedAmount: quotedAmount ?? usdCredit,
    stripeSourceAmount: stripeSourceAmount ?? undefined,
  }
}

export function expressDepositsQuoteIsStale(
  rateFetchedAt: number | null | undefined,
  maxAgeMs = 120_000,
): boolean {
  if (rateFetchedAt == null || !Number.isFinite(rateFetchedAt)) return false
  const fetchedMs = rateFetchedAt > 1e12 ? rateFetchedAt : rateFetchedAt * 1000
  return Date.now() - fetchedMs > maxAgeMs
}

export function buildExpressDepositsReviewRows(input: {
  pricing: ExpressDepositsPricingBreakdown
  method: "express_card" | "express_apple_pay" | "express_google_pay" | "express_ach"
  surface?: "review" | "detail"
}): ExpressDepositsReviewRow[] {
  const { pricing, method } = input
  const surface = input.surface ?? "review"
  const rows: ExpressDepositsReviewRow[] = []

  if (pricing.exchangeRate && pricing.exchangeRate.rate > 0) {
    rows.push({
      id: "exchange-rate",
      label: REVIEW_ROW_LABELS.exchangeRate,
      value: formatSendRateLabel(
        pricing.exchangeRate.from,
        pricing.exchangeRate.to,
        pricing.exchangeRate.rate,
      ),
    })
  }

  rows.push({
    id: "amount-to-credit",
    label: REVIEW_ROW_LABELS.amountToCredit,
    value: formatReviewRowMoneyDisplay(
      REVIEW_ROW_LABELS.amountToCredit,
      pricing.usdCredit,
      "USD",
    ),
  })

  if (isPayoutReviewFeeVisible(pricing.displayProcessingFee)) {
    rows.push({
      id: "processing-fee",
      label: REVIEW_ROW_LABELS.processingFee,
      value: formatReviewRowMoneyDisplay(
        REVIEW_ROW_LABELS.processingFee,
        pricing.displayProcessingFee,
        pricing.sourceCurrency,
      ),
    })
  }

  const payLabel =
    surface === "detail" ? REVIEW_ROW_LABELS.amountPaid : REVIEW_ROW_LABELS.totalToPay
  rows.push({
    id: "total-to-pay",
    label: payLabel,
    value: formatReviewRowMoneyDisplay(payLabel, pricing.totalToPay, pricing.sourceCurrency),
    valueBold: true,
  })

  rows.push({
    id: "deposit-method",
    label: REVIEW_ROW_LABELS.depositMethod,
    value: expressDepositMethodTitle(method),
  })

  return rows
}

export function expressDepositsSessionCreateParams(input: {
  pricing: ExpressDepositsPricingBreakdown
  baseParams: Record<string, unknown>
}): Record<string, unknown> {
  const mode = parseExpressDepositsAmountEntryMode(input.pricing.amountEntryMode)
  if (mode === "pay") {
    const source =
      positive(input.pricing.quotedAmount) ??
      positive(input.pricing.stripeSourceAmount) ??
      positive(input.pricing.stripeSourceTotal)
    if (source) return { ...input.baseParams, source_amount: String(source) }
  }
  const params = { ...input.baseParams, destination_amount: String(input.pricing.usdCredit) }
  if (input.pricing.easnerProcessingFeeDisplay > 0) {
    return {
      ...params,
      source_amount: String(input.pricing.totalToPay),
    }
  }
  return params
}
