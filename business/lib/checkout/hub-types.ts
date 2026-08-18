import type { CheckoutFeeMode } from "@/lib/stripe/checkout-fee-mode"
import type { MerchantWebhookEvent } from "@/lib/checkout/merchant-webhooks"

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
}

export type CheckoutApiKey = {
  id: string
  mode: "test" | "live"
  publishable_key: string
  secret_key_last4: string
  created_at: string
  last_used_at: string | null
}

export type CheckoutHubPayload = {
  settings: CheckoutHubSettings
  readiness: { ready: boolean; reason: string | null }
  keys: CheckoutApiKey[]
  webhookEvents: Record<MerchantWebhookEvent, string>
}
