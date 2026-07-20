import {
  isYcPayInFlowMetadata,
  readYcPayInExpiresAt,
  resolveYcPayInPaymentDetails,
  type YcPayInPaymentDetails,
} from "@easner/shared"

export function attachYcPayInPaymentDetails(
  transaction: Record<string, unknown>,
  metadata: Record<string, unknown> | null | undefined,
  easnerTransactionId?: string | null,
): Record<string, unknown> & {
  yc_pay_in_payment_details?: YcPayInPaymentDetails
  quote_expires_at?: string
  quoteExpiresAt?: string
} {
  if (!metadata || !isYcPayInFlowMetadata(metadata)) return transaction

  const quoteExpiresAt = readYcPayInExpiresAt(metadata) ?? undefined
  const withExpiry =
    quoteExpiresAt != null
      ? { ...transaction, quote_expires_at: quoteExpiresAt, quoteExpiresAt }
      : transaction

  const details = resolveYcPayInPaymentDetails(metadata, { easnerTransactionId })
  if (!details) return withExpiry
  return { ...withExpiry, yc_pay_in_payment_details: details }
}
