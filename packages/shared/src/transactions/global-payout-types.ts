export type GlobalPayoutReviewSnapshot = {
  you_send_amount: number
  total_debited: number
  exchange_fee: number
  /** Persisted for metadata/ops; not shown on customer confirm/detail for global fiat (margin in rate). */
  processing_fee: number
  exchange_rate: number
  send_currency: string
  receive_amount: number
  requested_receive_amount?: number
  receive_currency: string
  transfer_method: string
  processing_time: string
  margin_amount?: number
  easner_fee?: number
  noah_floor?: number
  noah_send_amount?: number
  /** USDC/EURC authorized to Yellowcard (not Noah). */
  yc_floor?: number
  yc_send_amount?: number
  channel_cost?: number
  /** Noah merchant schedule fee at quote (reconciliation). */
  noah_schedule_fee?: number
  /** Noah prepare Breakdown ChannelFee when captured at quote. */
  noah_channel_fee?: number
  /** Ticket-sized Noah mid at quote time. */
  quote_noah_mid?: number
  network_fee?: number
  execution_model?: "direct_turnkey" | "relay_bridge"
  /** Pay-in flows: combined fee in local currency for display (Easner 1% + YC legs). */
  display_processing_fee_local?: number
  /** Cross-border pay-in: local principal before processing fees. */
  principal_local_pay_in?: number
}

/** Customer-facing payout amount; provider round-up remains in receive_amount for settlement/audit. */
export function displayPayoutReceiveAmount(review: GlobalPayoutReviewSnapshot): number {
  const requested = Number(review.requested_receive_amount)
  return Number.isFinite(requested) && requested > 0 ? requested : review.receive_amount
}

export type GlobalPayoutRecipientSnapshot = {
  full_name: string
  bank_name?: string
  account_number?: string
  phone?: string
  mobile_provider?: string
  country_code?: string
  currency?: string
  transfer_type?: string
}
