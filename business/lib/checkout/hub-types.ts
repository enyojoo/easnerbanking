import type { CheckoutFeeMode } from "@/lib/stripe/checkout-fee-mode"
import type { MerchantWebhookEvent } from "@/lib/checkout/merchant-webhooks"

export type CheckoutSite = {
  id: string
  origin: string
  successUrl: string | null
  cancelUrl: string | null
  createdAt: string
  updatedAt: string
}

export type CheckoutHubSettings = {
  feeMode: CheckoutFeeMode
  businessFeeMode: CheckoutFeeMode | null
  feeModeManagedByEasner: boolean
  onlinePaymentsEnabled: boolean
  allowedOrigins: string[]
  defaultSuccessUrl: string | null
  defaultCancelUrl: string | null
  webhookUrl: string | null
  webhookSecretLast4: string | null
  liveModeEnabled: boolean
  testPaymentCompletedAt: string | null
  branding: { brandColor: string | null; buttonRadius: "pill" | "rounded" }
}

export type CheckoutApiKey = {
  id: string
  mode: "test" | "live"
  publishable_key: string
  secret_key_last4: string
  created_at: string
  last_used_at: string | null
}

export type CheckoutTestPayment = {
  id: string
  source: "embed" | "payment_link"
  amountCents: number
  currency: string
  customerEmail: string | null
  completedAt: string | null
}

export type CheckoutHubPayload = {
  settings: CheckoutHubSettings
  sites: CheckoutSite[]
  readiness: { ready: boolean; reason: string | null }
  keys: CheckoutApiKey[]
  webhookEvents: Record<MerchantWebhookEvent, string>
  /** Evidence the merchant actually integrated – drives truthful setup progress. */
  integration: {
    /** First session created through the merchant API (test or live). */
    sessionCreatedAt: string | null
    /** Most recent successful delivery to their webhook endpoint (test counts). */
    webhookDeliveredAt: string | null
  }
}

export type WebhookDelivery = {
  id: string
  event: string
  status: "pending" | "delivered" | "failed"
  attempts: number
  last_attempt_at: string | null
  next_retry_at: string | null
  response_status: number | null
  last_error: string | null
  delivered_at: string | null
  created_at: string
}
