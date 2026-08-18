import type { SupabaseClient } from "@supabase/supabase-js"
import { decryptCheckoutSecret, signMerchantWebhookPayload } from "./secrets"

/**
 * Easner event names sent to merchants. Provider event names never leave the platform.
 */
export const MERCHANT_WEBHOOK_EVENTS = [
  "checkout.completed",
  "checkout.async_succeeded",
  "checkout.failed",
  "payment.available",
  "subscription.updated",
  "subscription.canceled",
] as const

export type MerchantWebhookEvent = (typeof MERCHANT_WEBHOOK_EVENTS)[number]

export const MERCHANT_WEBHOOK_EVENT_DESCRIPTIONS: Record<MerchantWebhookEvent, string> = {
  "checkout.completed": "Payment succeeded – safe to fulfil the order.",
  "checkout.async_succeeded": "A delayed method (such as bank debit) finally cleared.",
  "checkout.failed": "The payment attempt failed or was abandoned.",
  "payment.available": "Funds landed in the Easner Balance and are available to use.",
  "subscription.updated": "A recurring payment renewed or its plan changed.",
  "subscription.canceled": "A recurring payment was cancelled.",
}

const DELIVERY_TIMEOUT_MS = 8000

/**
 * POST a signed Easner event to the merchant endpoint configured on /checkout.
 * Best-effort: never throws, so settlement is not blocked by a merchant outage.
 */
export async function dispatchMerchantWebhook(
  admin: SupabaseClient,
  input: {
    businessId: string
    event: MerchantWebhookEvent
    data: Record<string, unknown>
  },
): Promise<{ delivered: boolean; status?: number; error?: string }> {
  const { data: settings } = await admin
    .from("business_checkout_settings")
    .select("webhook_url, webhook_secret_ciphertext")
    .eq("business_id", input.businessId)
    .maybeSingle()

  const url = typeof settings?.webhook_url === "string" ? settings.webhook_url.trim() : ""
  const secret = decryptCheckoutSecret(settings?.webhook_secret_ciphertext as string | null)
  if (!url || !secret) return { delivered: false }

  const timestampSeconds = Math.floor(Date.now() / 1000)
  const body = JSON.stringify({
    type: input.event,
    created: timestampSeconds,
    data: input.data,
  })

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "easner-signature": signMerchantWebhookPayload({ secret, body, timestampSeconds }),
        "easner-event": input.event,
      },
      body,
      signal: AbortSignal.timeout(DELIVERY_TIMEOUT_MS),
    })
    return { delivered: response.ok, status: response.status }
  } catch (e) {
    const error = e instanceof Error ? e.message : "Webhook delivery failed"
    console.warn("[checkout] merchant webhook failed", input.businessId, input.event, error)
    return { delivered: false, error }
  }
}
