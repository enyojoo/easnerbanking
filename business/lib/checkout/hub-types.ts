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
  lastWebhookDeliveredAt: string | null
  subscribedWebhookEvents?: MerchantWebhookEvent[]
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
}
