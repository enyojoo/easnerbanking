export interface Currency {
  id: string
  code: string
  name: string
  symbol: string
  flag: string
  flag_svg?: string
  status: string
  can_send?: boolean
  can_receive?: boolean
  created_at: string
  updated_at: string
}

export interface ExchangeRate {
  id: string
  from_currency: string
  to_currency: string
  rate: number
  fee_type: "free" | "fixed" | "percentage"
  fee_amount: number
  min_amount?: number
  max_amount?: number
  status: string
  created_at: string
  updated_at: string
  from_currency_info?: Currency
  to_currency_info?: Currency
}

export interface Recipient {
  id: string
  user_id: string
  full_name: string
  account_number: string
  bank_name: string
  phone_number?: string
  currency: string
  routing_number?: string
  sort_code?: string
  iban?: string
  swift_bic?: string
  address_line1?: string
  address_line2?: string
  city?: string
  state?: string
  postal_code?: string
  transfer_type?: "ACH" | "Wire"
  checking_or_savings?: "checking" | "savings"
  created_at: string
  updated_at: string
}

export interface Transaction {
  id: string
  user_id: string
  business_id?: string | null
  provider: string
  provider_transaction_id?: string | null
  provider_event_id?: string | null
  easner_transaction_id?: string | null
  status: string
  amount?: number | null
  currency?: string | null
  direction?: "in" | "out" | null
  payload?: any
  metadata?: any
  occurred_at?: string | null
  settled_at?: string | null
  tx_hash?: string | null
  created_at: string
  updated_at: string
  user?: {
    first_name: string
    last_name: string
    email: string
  }
}

export type AccountType = "us" | "uk" | "euro" | "generic"

export interface PaymentMethod {
  id: string
  currency: string
  type: "bank_account" | "qr_code"
  name: string
  account_name?: string
  account_number?: string
  bank_name?: string
  routing_number?: string
  sort_code?: string
  iban?: string
  swift_bic?: string
  qr_code_data?: string
  instructions?: string
  completion_timer_seconds?: number
  is_default: boolean
  status: "active" | "inactive"
  created_at: string
  updated_at: string
}

export interface User {
  id: string
  email: string
  first_name: string
  last_name: string
  phone?: string
  base_currency: string
  status: "active" | "inactive"
  // verification_status removed - use noah_kyc_status for KYC status
  created_at: string
  updated_at: string
}

export interface TransactionStatusHistory {
  id: string
  transaction_id: string
  status: "pending" | "processing" | "completed" | "failed" | "cancelled"
  previous_status?: string
  failure_reason?: string
  created_at: string
  updated_at: string
}
