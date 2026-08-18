import { getStripePlatformFeeBps } from "./config"
import type { CheckoutFeeMode } from "./checkout-fee-mode"

/**
 * Processing estimate used to size `application_fee_amount` on destination charges.
 * Actual processing is settled against the platform balance; the estimate keeps the
 * merchant's net predictable and is reconciled by the margin report.
 */
const PROCESSING_PERCENT = 0.029
const PROCESSING_FIXED_CENTS = 30

export type CheckoutAmounts = {
  feeMode: CheckoutFeeMode
  /** Amount listed by the merchant (the invoice total, link amount, or embed amount). */
  listedAmountCents: number
  /** Amount charged to the customer — differs from listed only for buyer surcharge. */
  customerAmountCents: number
  /** Surcharge added on top of the listed amount (0 unless buyer surcharge). */
  surchargeCents: number
  /** Estimated processing fee on the customer amount. */
  processingEstimateCents: number
  /** Easner product take (0 today). */
  easnerTakeCents: number
  /** `application_fee_amount` for one-time payments. */
  applicationFeeCents: number
  /** `application_fee_percent` for subscriptions — same economics expressed as a percent. */
  applicationFeePercent: number
  /** What the merchant's Easner Balance should receive. */
  merchantNetCents: number
}

function estimateProcessingCents(amountCents: number): number {
  if (amountCents <= 0) return 0
  return Math.round(amountCents * PROCESSING_PERCENT) + PROCESSING_FIXED_CENTS
}

/** Charge amount whose processing estimate leaves the merchant with the listed amount. */
function grossUpForSurcharge(listedAmountCents: number): number {
  if (listedAmountCents <= 0) return 0
  return Math.ceil((listedAmountCents + PROCESSING_FIXED_CENTS) / (1 - PROCESSING_PERCENT))
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
}): CheckoutAmounts {
  const listedAmountCents = Math.max(0, Math.round(input.listedAmountCents))
  const feeMode = input.feeMode

  const customerAmountCents =
    feeMode === "buyer_surcharge" ? grossUpForSurcharge(listedAmountCents) : listedAmountCents
  const surchargeCents = customerAmountCents - listedAmountCents
  const processingEstimateCents = estimateProcessingCents(customerAmountCents)
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
