import { expressDepositActivityLabel, isExpressDepositsMetadata } from "./express-deposits-copy"
import type { ExpressDepositsPricingBreakdown } from "./express-deposits-pricing"
import { BANK_DEPOSIT_COMPLETED_DESCRIPTION } from "./transactions/bank-deposit-lifecycle"

export type ExpressDepositsReview = {
  youGet: number
  youGetCurrency: string
  youPay: number
  youPayCurrency: string
  paymentMethod: string
  processingFee?: number
  processingFeeCurrency?: string
  easnerProcessingFeeUsd?: number
  stripeFees?: { transaction: number; network: number; total: number }
  exchangeRate?: { from: string; to: string; rate: number }
}

function asRecord(raw: unknown): Record<string, unknown> {
  return raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {}
}

function positive(n: unknown): number | null {
  const v = Number(n)
  return Number.isFinite(v) && v > 0 ? v : null
}

function readExchangeRate(raw: unknown): ExpressDepositsReview["exchangeRate"] {
  const row = asRecord(raw)
  const from = String(row.from || "").trim().toUpperCase()
  const to = String(row.to || "").trim().toUpperCase()
  const rate = Number(row.rate)
  if (!from || !to || !(rate > 0)) return undefined
  return { from, to, rate }
}

function readStripeFees(raw: unknown): ExpressDepositsReview["stripeFees"] {
  const row = asRecord(raw)
  const transaction = Number(row.transaction)
  const network = Number(row.network)
  const total = Number(row.total)
  if (!Number.isFinite(total) && !Number.isFinite(transaction)) return undefined
  return {
    transaction: Number.isFinite(transaction) ? transaction : 0,
    network: Number.isFinite(network) ? network : 0,
    total: Number.isFinite(total)
      ? total
      : (Number.isFinite(transaction) ? transaction : 0) + (Number.isFinite(network) ? network : 0),
  }
}

export function buildExpressDepositsDepositReview(input: {
  pricing: ExpressDepositsPricingBreakdown
  paymentMethod: string
}): Record<string, unknown> {
  const { pricing, paymentMethod } = input
  return {
    you_get: pricing.usdCredit,
    you_get_currency: "USD",
    you_pay: pricing.totalToPay,
    you_pay_currency: pricing.sourceCurrency,
    processing_fee: pricing.displayProcessingFee,
    processing_fee_currency: pricing.sourceCurrency,
    easner_processing_fee_usd: pricing.easnerProcessingFeeUsd,
    stripe_fees: pricing.stripeFees,
    exchange_rate: pricing.exchangeRate,
    payment_method: paymentMethod,
  }
}

export function normalizeExpressDepositsReview(
  meta: Record<string, unknown> | null | undefined,
): ExpressDepositsReview | null {
  if (!meta || !isExpressDepositsMetadata(meta)) return null
  const review = asRecord(meta.deposit_review)
  const youGet =
    positive(review.you_get) ??
    positive(meta.usd_credit) ??
    null
  const youPay =
    positive(review.you_pay) ??
    youGet
  if (youGet == null || youPay == null) return null
  const processingFee = positive(review.processing_fee)
  const easnerProcessingFeeUsd = positive(review.easner_processing_fee_usd)
  return {
    youGet,
    youGetCurrency: String(review.you_get_currency || "USD").trim().toUpperCase() || "USD",
    youPay,
    youPayCurrency: String(review.you_pay_currency || "USD").trim().toUpperCase() || "USD",
    paymentMethod: String(review.payment_method || meta.payment_method || "").trim(),
    ...(processingFee != null
      ? {
          processingFee,
          processingFeeCurrency:
            String(review.processing_fee_currency || review.you_pay_currency || "USD")
              .trim()
              .toUpperCase() || "USD",
        }
      : {}),
    ...(easnerProcessingFeeUsd != null ? { easnerProcessingFeeUsd } : {}),
    ...(readStripeFees(review.stripe_fees) ? { stripeFees: readStripeFees(review.stripe_fees) } : {}),
    ...(readExchangeRate(review.exchange_rate)
      ? { exchangeRate: readExchangeRate(review.exchange_rate) }
      : {}),
  }
}

export const EXPRESS_DEPOSITS_PROCESSING_DESCRIPTION =
  "We're confirming your deposit. Funds will be available in your USD Balance once it completes."

export type ExpressDepositsLifecycleStep = {
  id: "processing" | "completed" | "failed"
  title: string
  description: string
  state: "complete" | "current" | "upcoming"
  occurredAt: string | null
}

function readIso(meta: Record<string, unknown>, key: string): string | null {
  const v = meta[key]
  if (v == null) return null
  const s = String(v).trim()
  return s || null
}

function ledgerStatus(status: string): "settled" | "failed" | "processing" {
  const s = String(status || "").trim().toLowerCase()
  if (s === "settled") return "settled"
  if (s === "failed" || s === "cancelled") return "failed"
  return "processing"
}

export function buildExpressDepositsLifecycle(input: {
  status: string
  metadata?: Record<string, unknown> | null
  createdAt?: string | null
  settledAt?: string | null
}): ExpressDepositsLifecycleStep[] {
  const meta = input.metadata ?? {}
  const status = ledgerStatus(input.status)
  const processingAt =
    readIso(meta, "processing_at") ?? input.createdAt ?? null
  const completedAt =
    readIso(meta, "completed_at") ?? input.settledAt ?? null
  const failedAt = readIso(meta, "failed_at") ?? null
  const method = expressDepositActivityLabel(String(meta.payment_method ?? "")).toLowerCase()

  if (status === "failed") {
    return [
      {
        id: "processing",
        title: "Processing",
        description: EXPRESS_DEPOSITS_PROCESSING_DESCRIPTION,
        state: "complete",
        occurredAt: processingAt,
      },
      {
        id: "failed",
        title: "Failed",
        description: `This ${method} could not be posted to your account.`,
        state: "current",
        occurredAt: failedAt,
      },
    ]
  }

  const settled = status === "settled"
  return [
    {
      id: "processing",
      title: "Processing",
      description: EXPRESS_DEPOSITS_PROCESSING_DESCRIPTION,
      state: settled ? "complete" : "current",
      occurredAt: processingAt,
    },
    {
      id: "completed",
      title: "Completed",
      description: BANK_DEPOSIT_COMPLETED_DESCRIPTION,
      state: settled ? "complete" : "upcoming",
      occurredAt: settled ? completedAt : null,
    },
  ]
}
