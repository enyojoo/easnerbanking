import type { GlobalPayoutReviewSnapshot } from "@/lib/noah/build-payout-execute-snapshot"

export function buildGridBalancePayoutOutMetadata(input: {
  easnerPayoutId: string
  easnerTransactionId: string
  quoteId: string
  sequenceId: string
  customerId?: string
  externalAccountId?: string
  fiatAmount: number
  fiatCurrency: string
  countryCode: string
  recipientId: string
  recipientSnapshot: Record<string, unknown>
  reviewSnapshot?: GlobalPayoutReviewSnapshot | null
  sendNote?: string
  idempotencyKey?: string
  fundingAddress?: string
  pricing: {
    totalDebited: number
    customerPrincipal: number
    marginAmount: number
    processingFee: number
    channelCost: number
    customerRate?: number
  }
}): Record<string, unknown> {
  const recipientName = String(input.recipientSnapshot.full_name ?? "").trim()
  return {
    easner_payout_id: input.easnerPayoutId,
    easner_transaction_id: input.easnerTransactionId,
    payout_provider: "grid",
    grid_quote_id: input.quoteId,
    grid_sequence_id: input.sequenceId,
    grid_customer_id: input.customerId,
    grid_external_account_id: input.externalAccountId,
    grid_funding_address: input.fundingAddress,
    form_session_id: input.sequenceId,
    idempotency_key: input.idempotencyKey || undefined,
    recipient_id: input.recipientId,
    recipient_snapshot: input.recipientSnapshot,
    country_code: input.countryCode,
    fiat_amount: input.fiatAmount,
    fiat_currency: input.fiatCurrency,
    receive_amount: input.fiatAmount,
    receive_currency: input.fiatCurrency,
    total_debited: input.pricing.totalDebited,
    customer_principal: input.pricing.customerPrincipal,
    margin_amount: input.pricing.marginAmount,
    processing_fee: input.pricing.processingFee,
    channel_cost: input.pricing.channelCost,
    customer_rate: input.pricing.customerRate,
    margin_capture_mode: "fee_wallet_deferred",
    ...(input.sendNote ? { note: input.sendNote } : {}),
    ...(input.reviewSnapshot ? { review_snapshot: input.reviewSnapshot } : {}),
    ...(recipientName
      ? {
          beneficiary_name: recipientName,
          recipient_name: recipientName,
          counterparty_name: recipientName,
        }
      : {}),
  }
}

export function mergeGridPayoutLifecycle(
  prior: Record<string, unknown>,
  patch: Record<string, unknown>,
): Record<string, unknown> {
  return { ...prior, ...patch, grid_lifecycle: { ...(prior.grid_lifecycle as object), ...patch } }
}
