import { getStripePlatformFeeBps } from "./config"
import type { CheckoutFeeMode } from "./checkout-fee-mode"

/**
 * Processing estimate used to size `application_fee_amount` on destination charges.
 * Actual processing is settled against the platform balance; the estimate keeps the
 * merchant's net predictable and is reconciled by the margin report.
 */
const PROCESSING_PERCENT = 0.029
const PROCESSING_FIXED_CENTS = 30

export type ProcessingFeeSchedule = { percent: number; fixedCents: number }

const DEFAULT_PROCESSING_FEE: ProcessingFeeSchedule = {
  percent: PROCESSING_PERCENT,
  fixedCents: PROCESSING_FIXED_CENTS,
}

let cachedFeeSchedule: { raw: string; byCurrency: Record<string, ProcessingFeeSchedule> } | null = null

/**
 * Per-currency processing estimate, configurable without a deploy:
 * `CHECKOUT_PROCESSING_FEE_SCHEDULE='{"EUR":{"percent":2.5,"fixedCents":25}}'`
 * (percent is human-readable, e.g. 2.9 = 2.9%). Unlisted currencies keep the
 * 2.9% + 30¢ default the platform has always used.
 */
export function getProcessingFeeSchedule(currency?: string | null): ProcessingFeeSchedule {
  const raw = process.env.CHECKOUT_PROCESSING_FEE_SCHEDULE?.trim() || ""
  if (!raw) return DEFAULT_PROCESSING_FEE
  if (!cachedFeeSchedule || cachedFeeSchedule.raw !== raw) {
    const byCurrency: Record<string, ProcessingFeeSchedule> = {}
    try {
      const parsed = JSON.parse(raw) as Record<string, { percent?: unknown; fixedCents?: unknown }>
      for (const [code, entry] of Object.entries(parsed ?? {})) {
        const percent = Number(entry?.percent)
        const fixedCents = Number(entry?.fixedCents)
        if (Number.isFinite(percent) && percent >= 0 && percent < 100 && Number.isFinite(fixedCents) && fixedCents >= 0) {
          byCurrency[code.toUpperCase()] = { percent: percent / 100, fixedCents: Math.round(fixedCents) }
        }
      }
    } catch {
      // Malformed config falls back to the default for every currency.
    }
    cachedFeeSchedule = { raw, byCurrency }
  }
  const code = String(currency ?? "").trim().toUpperCase()
  return cachedFeeSchedule.byCurrency[code] ?? DEFAULT_PROCESSING_FEE
}

export type CheckoutAmounts = {
  feeMode: CheckoutFeeMode
  /** Amount listed by the merchant (the invoice total, link amount, or embed amount). */
  listedAmountCents: number
  /** Amount charged to the customer – differs from listed only for buyer surcharge. */
  customerAmountCents: number
  /** Surcharge added on top of the listed amount (0 unless buyer surcharge). */
  surchargeCents: number
  /** Estimated processing fee on the customer amount. */
  processingEstimateCents: number
  /** Easner product take (0 today). */
  easnerTakeCents: number
  /** `application_fee_amount` for one-time payments. */
  applicationFeeCents: number
  /** `application_fee_percent` for subscriptions – same economics expressed as a percent. */
  applicationFeePercent: number
  /** What the merchant's Easner Balance should receive. */
  merchantNetCents: number
}

function estimateProcessingCents(amountCents: number, fee: ProcessingFeeSchedule): number {
  if (amountCents <= 0) return 0
  return Math.round(amountCents * fee.percent) + fee.fixedCents
}

/** Charge amount whose processing estimate leaves the merchant with the listed amount. */
function grossUpForSurcharge(listedAmountCents: number, fee: ProcessingFeeSchedule): number {
  if (listedAmountCents <= 0) return 0
  return Math.ceil((listedAmountCents + fee.fixedCents) / (1 - fee.percent))
}

function toPercent(feeCents: number, amountCents: number): number {
  if (amountCents <= 0 || feeCents <= 0) return 0
  return Math.round((feeCents / amountCents) * 10000) / 100
}

/**
 * Amounts + platform fee wiring for one checkout collection.
 * `application_fee_amount` is always set (except when Easner absorbs) so the
 * destination transfer leaves the merchant with the net implied by the fee mode.
 */
export function computeCheckoutAmounts(input: {
  listedAmountCents: number
  feeMode: CheckoutFeeMode
  /** Session currency – picks the per-currency processing schedule (default USD rates). */
  currency?: string | null
}): CheckoutAmounts {
  const listedAmountCents = Math.max(0, Math.round(input.listedAmountCents))
  const feeMode = input.feeMode
  const fee = getProcessingFeeSchedule(input.currency)

  const customerAmountCents =
    feeMode === "buyer_surcharge" ? grossUpForSurcharge(listedAmountCents, fee) : listedAmountCents
  const surchargeCents = customerAmountCents - listedAmountCents
  const processingEstimateCents = estimateProcessingCents(customerAmountCents, fee)
  const easnerTakeCents = Math.round((customerAmountCents * getStripePlatformFeeBps()) / 10000)

  const applicationFeeCents =
    feeMode === "easner_absorbs"
      ? 0
      : Math.min(
          customerAmountCents,
          feeMode === "buyer_surcharge"
            ? surchargeCents + easnerTakeCents
            : processingEstimateCents + easnerTakeCents,
        )

  return {
    feeMode,
    listedAmountCents,
    customerAmountCents,
    surchargeCents,
    processingEstimateCents,
    easnerTakeCents,
    applicationFeeCents,
    applicationFeePercent: toPercent(applicationFeeCents, customerAmountCents),
    merchantNetCents: customerAmountCents - applicationFeeCents,
  }
}
