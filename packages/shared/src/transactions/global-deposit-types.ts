export type YcPayInRail = "bank_transfer" | "mobile_money"

export type YcFundBalanceDepositReviewSnapshot = {
  local_pay_in: number
  local_currency: string
  usd_credit: number
  processing_fee: number
  exchange_fee?: number
  exchange_rate: number
  transfer_method: string
  credit_to: string
  residence_country: string
  pay_in_rail: YcPayInRail
  /** Combined processing fee in pay-in currency (display-only). */
  display_processing_fee_local?: number
}
