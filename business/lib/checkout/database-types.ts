/**
 * Collections table shapes used by Checkout, Payment Links, and invoice Pay online.
 * Mirrors `business/supabase/migrations/20260826020000_collections_tables.sql`.
 */

export type CheckoutSessionStatus = "open" | "complete" | "expired" | "failed"
export type CheckoutSessionMode = "payment" | "subscription"
export type CheckoutCollectionSource = "invoice" | "payment_link" | "embed"
export type CheckoutSettlementPhase = "payment_received" | "credited" | "failed"
export type CheckoutKeyMode = "test" | "live"

export type BusinessCheckoutSettingsRow = {
  business_id: string
  fee_mode: string | null
  allowed_origins: string[] | null
  default_success_url: string | null
  default_cancel_url: string | null
  appearance: Record<string, unknown> | null
  webhook_url: string | null
  webhook_secret_ciphertext: string | null
  webhook_secret_key_id: string | null
  webhook_secret_last4: string | null
  live_mode_enabled: boolean
  test_payment_completed_at: string | null
  online_payments_enabled: boolean | null
  created_at: string
  updated_at: string
}

export type BusinessCheckoutSiteRow = {
  id: string
  business_id: string
  origin: string
  success_url: string | null
  cancel_url: string | null
  created_at: string
  updated_at: string
}

export type BusinessApiKeyRow = {
  id: string
  business_id: string
  mode: CheckoutKeyMode
  publishable_key: string
  secret_key_hash: string
  secret_key_last4: string
  scopes: string[]
  created_by: string | null
  last_used_at: string | null
  revoked_at: string | null
  created_at: string
  updated_at: string
}

export type PaymentLinkRow = {
  id: string
  business_id: string
  created_by: string | null
  public_id: string | null
  slug: string
  label: string
  description: string | null
  amount_cents: number
  currency: string
  rail: string
  mode: string
  billing_interval: string | null
  trial_days: number | null
  redirect_url: string | null
  stripe_price_id: string | null
  autopayout_config_id: string | null
  payment_count: number
  archived_at: string | null
  created_at: string
  updated_at: string
}

export type OnlineCheckoutSessionRow = {
  id: string
  business_id: string
  source: CheckoutCollectionSource
  invoice_id: string | null
  payment_link_id: string | null
  mode: CheckoutSessionMode
  status: CheckoutSessionStatus
  fee_mode: string | null
  easner_settlement_id: string
  idempotency_key: string | null
  listed_amount_cents: number | null
  gross_cents: number | null
  application_fee_cents: number | null
  fee_cents: number | null
  net_cents: number | null
  currency: string
  customer_email: string | null
  return_url: string | null
  stripe_connected_account_id: string | null
  stripe_checkout_session_id: string | null
  stripe_payment_intent_id: string | null
  stripe_subscription_id: string | null
  payment_method_type: string | null
  livemode: boolean
  metadata: Record<string, unknown>
  completed_at: string | null
  created_at: string
  updated_at: string
}

export type InvoiceCheckoutSessionRow = {
  id: string
  invoice_id: string | null
  business_id: string
  easner_settlement_id: string
  status: CheckoutSessionStatus
  gross_cents: number | null
  listed_amount_cents: number | null
  application_fee_cents: number | null
  fee_cents: number | null
  net_cents: number | null
  fee_mode: string | null
  currency: string
  customer_email: string | null
  idempotency_key: string | null
  stripe_connected_account_id: string | null
  stripe_checkout_session_id: string | null
  stripe_payment_intent_id: string | null
  payment_method_type: string | null
  completed_at: string | null
  created_at: string
  updated_at: string
}

export type CheckoutStripeSettlementRow = {
  id: string
  business_id: string
  checkout_session_id: string | null
  payment_link_id: string | null
  invoice_id: string | null
  source: CheckoutCollectionSource
  stripe_payment_intent_id: string | null
  stripe_charge_id: string | null
  stripe_connected_account_id: string | null
  stripe_transfer_id: string | null
  stripe_subscription_id: string | null
  stripe_refund_id: string | null
  gross_cents: number | null
  fee_cents: number | null
  net_cents: number | null
  currency: string
  phase: CheckoutSettlementPhase
  ledger_transaction_id: string | null
  stripe_event_ids: string[]
  refunded_at: string | null
  created_at: string
  updated_at: string
}

export type CheckoutWebhookDeliveryRow = {
  id: string
  business_id: string
  event: string
  payload: Record<string, unknown>
  status: "pending" | "delivered" | "failed"
  attempt_count: number
  max_attempts: number
  next_attempt_at: string | null
  last_attempt_at: string | null
  last_status_code: number | null
  last_error: string | null
  response_body: string | null
  delivered_at: string | null
  created_at: string
  updated_at: string
}
