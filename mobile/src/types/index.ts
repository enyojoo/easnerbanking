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
  country_code?: string
  /** When linked to Noah external account for payouts */
  noah_external_account_id?: string
  /** Noah form-session sell (must match prepare fiat amount) */
  noah_form_session_id?: string | null
  noah_sell_crypto_authorized?: string | null
  noah_sell_crypto_currency?: string | null
  full_name: string
  account_number: string
  bank_name: string
  phone_number?: string
  email?: string
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
  /** Easetag (@handle): P2P via Easner internal ledger when enabled; legacy Noah w2w otherwise. */
  payee_easetag?: string
  /** Snapshot of payee `users.avatar_url` at save time (Easetag / P2P recipients). */
  payee_avatar_url?: string
  /** Easetag profile: personal user vs business (from public lookup). */
  payee_account_kind?: 'business' | 'personal'
  transfer_type?: "ACH" | "Wire"
  checking_or_savings?: "checking" | "savings"
  mobile_provider?: string
  wallet_network?: string
  wallet_memo_tag?: string
  created_at: string
  updated_at: string
}

export interface Transaction {
  id: string
  transaction_id: string
  user_id: string
  /** Legacy Bridge send flow; Noah ledger items may omit this. */
  recipient_id?: string
  send_amount: number
  send_currency: string
  receive_amount: number
  receive_currency: string
  exchange_rate: number
  fee_amount: number
  fee_type: string
  total_amount: number
  status: "pending" | "processing" | "completed" | "failed" | "cancelled"
  reference?: string
  receipt_url?: string
  receipt_filename?: string
  created_at: string
  updated_at: string
  completed_at?: string
  failure_reason?: string
  recipient?: Recipient
  user?: {
    first_name: string
    last_name: string
    email: string
  }
  /** Noah raw payload / list metadata */
  metadata?: Record<string, unknown>
}

/** Detail shape for transactionService + Noah API mapping */
export interface TransactionData {
  id: string
  transaction_id: string
  user_id: string
  recipient_id?: string
  send_amount: number
  send_currency: string
  receive_amount: number
  receive_currency: string
  exchange_rate: number
  fee_amount: number
  fee_type: string
  total_amount: number
  status: string
  reference?: string
  created_at: string
  updated_at: string
  completed_at?: string
  receipt_url?: string
  receipt_filename?: string
  failure_reason?: string
  recipient?: Recipient
  user?: {
    first_name: string
    last_name: string
    email: string
  }
  metadata?: Record<string, unknown>
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

/** Mirrors `public.users` (`select('*')`) plus derived name fields for forms. */
export interface User {
  id: string
  email: string
  /** `public.users.full_name` — source of truth for display name */
  full_name: string | null
  /** Derived from `full_name` for forms / greetings */
  first_name: string
  middle_name?: string
  last_name: string
  phone?: string | null
  date_of_birth?: string | null
  avatar_url?: string | null
  role?: "individual" | "business"
  easner_business_id?: string | null
  enabled_extra_account_currencies?: string[]
  noah_customer_id?: string | null
  noah_kyc_status?: string | null
  noah_kyc_rejection_reasons?: unknown
  noah_usd_virtual_account_id?: string | null
  noah_eur_virtual_account_id?: string | null
  noah_gbp_virtual_account_id?: string | null
  kyc_id_type?: string | null
  kyc_id_number?: string | null
  kyc_id_issuing_country?: string | null
  kyc_address_street?: string | null
  kyc_address_city?: string | null
  kyc_address_state?: string | null
  kyc_address_post_code?: string | null
  kyc_address_country?: string | null
  kyc_verified_at?: string | null
  status: "active" | "inactive"
  /** Legacy default for stats until preferences live on `users` */
  base_currency?: string
  easetag?: string
  bridge_kyc_status?: string
  bridge_customer_id?: string
  bridge_kyc_rejection_reasons?: unknown
  bridge_endorsements?: unknown
  bridge_signed_agreement_id?: string
  address?: string
  residential_address?: {
    line1?: string
    line2?: string
    city?: string
    state?: string
    postal_code?: string
    country?: string
  }
  country_code?: string
  bridge_kyc_metadata?: unknown
  created_at: string
  updated_at: string
}

import type { VerifiedIdentityPayload } from '@easner/shared'

// Mobile-specific types
export interface AuthUser {
  id: string
  email: string
  isAdmin: boolean
  profile: User
  /** Built from KYC columns when profile is locked; persisted in profile snapshot. */
  verifiedIdentity?: VerifiedIdentityPayload
  /** Noah / org fields (duplicate `profile` for screens that read `userProfile.noah_*`) */
  noah_customer_id?: string | null
  noah_kyc_status?: string | null
  noah_kyc_rejection_reasons?: unknown
  role?: "individual" | "business"
  easner_business_id?: string | null
  bridge_kyc_status?: string
  bridge_customer_id?: string
  bridge_kyc_rejection_reasons?: unknown
  bridge_endorsements?: unknown
  bridge_signed_agreement_id?: string
  middle_name?: string
  easetag?: string
  email_confirmed_at?: string
  updated_at?: string
}

export interface NavigationProps {
  navigation: any
  route: any
}

export interface KYCSubmission {
  id: string
  user_id: string
  type: "identity" | "address"
  status: "pending" | "in_review" | "approved" | "rejected"
  country_code?: string
  full_name?: string
  date_of_birth?: string
  id_type?: string
  id_document_url?: string
  id_document_filename?: string
  document_type?: string
  address?: string
  address_document_url?: string
  address_document_filename?: string
  reviewed_by?: string
  reviewed_at?: string
  rejection_reason?: string
  metadata?: any // Bridge-specific KYC fields
  created_at: string
  updated_at: string
}
