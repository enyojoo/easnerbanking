export type GlobalPayoutReviewSnapshot = {
  you_send_amount: number
  total_debited: number
  exchange_fee: number
  processing_fee: number
  exchange_rate: number
  send_currency: string
  receive_amount: number
  receive_currency: string
  transfer_method: string
  processing_time: string
}

export type GlobalPayoutRecipientSnapshot = {
  full_name: string
  bank_name?: string
  account_number?: string
  phone?: string
  mobile_provider?: string
  country_code?: string
  currency?: string
}
