/**
 * Unified Yellowcard locked-quote shape for pay-in and cross-border flows.
 * Canonical fee values are USD; pay-in UI uses displayProcessingFeeLocal.
 */

export type YcPayInRail = "bank_transfer" | "mobile_money"

export type YcQuoteSummary = {
  customerRate: number
  /** Review estimate before YC leg fees (cross-border / optional fund balance). */
  provisionalPayIn?: number
  localPayIn: number
  creditOrReceiveAmount: number
  /** Easner 1% leg (USD). */
  processingFee: number
  /** All YC leg fees (USD). */
  ycLegFeesUsd: number
  /** Easner 1% + YC leg fees (USD) — canonical stored value. */
  displayProcessingFee: number
  /** Pay-in currency display only (YC pay-in + cross-border). */
  displayProcessingFeeLocal?: number
  displayProcessingFeeCurrency?: string
  expiresAt: string
  transactionId: string
  transferId: string
  payInRail: YcPayInRail
  bankInfo?: Record<string, unknown> | null
  sourcePhone?: string
  sourceNetworkId?: string
  sourceNetworkName?: string
}
