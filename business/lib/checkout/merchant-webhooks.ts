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
  "payment.disputed",
  "subscription.updated",
  "subscription.canceled",
  "subscription.past_due",
] as const

export type MerchantWebhookEvent = (typeof MERCHANT_WEBHOOK_EVENTS)[number]

export const MERCHANT_WEBHOOK_EVENT_DESCRIPTIONS: Record<MerchantWebhookEvent, string> = {
  "checkout.completed": "Payment succeeded – safe to fulfil the order.",
  "checkout.async_succeeded": "A delayed method (such as bank debit) finally cleared.",
  "checkout.failed": "The payment attempt failed or was abandoned.",
  "payment.available": "Funds landed in the Easner Balance and are available to use.",
  "payment.disputed": "A customer disputed a payment – respond with evidence from the dashboard.",
  "subscription.updated": "A recurring payment renewed or its plan changed.",
  "subscription.canceled": "A recurring payment was cancelled.",
  "subscription.past_due": "A renewal failed and the subscription needs a working payment method.",
}

const DELIVERY_TIMEOUT_MS = 8000

/**
 * Backoff after the initial in-line attempt. Exhausting the schedule marks the
 * delivery `failed`; the merchant can redeliver from the dashboard.
 */
export const MERCHANT_WEBHOOK_RETRY_DELAYS_SECONDS = [60, 300, 1800, 7200, 21600, 86400] as const
export const MERCHANT_WEBHOOK_MAX_ATTEMPTS = MERCHANT_WEBHOOK_RETRY_DELAYS_SECONDS.length + 1

export type MerchantWebhookAttemptResult = {
  delivered: boolean
  status?: number
  error?: string
}

type WebhookTarget = { url: string; secret: string }

async function resolveWebhookTarget(
  admin: SupabaseClient,
  businessId: string,
): Promise<WebhookTarget | null> {
  const { data: settings } = await admin
    .from("business_checkout_settings")
    .select("webhook_url, webhook_secret_ciphertext")
    .eq("business_id", businessId)
    .maybeSingle()

  const url = typeof settings?.webhook_url === "string" ? settings.webhook_url.trim() : ""
  const secret = decryptCheckoutSecret(settings?.webhook_secret_ciphertext as string | null)
  if (!url || !secret) return null
  return { url, secret }
}

/** One signed POST. The signature timestamp is fresh per attempt (retries re-sign). */
async function attemptDelivery(
  target: WebhookTarget,
  event: MerchantWebhookEvent | string,
  body: string,
): Promise<MerchantWebhookAttemptResult> {
  const timestampSeconds = Math.floor(Date.now() / 1000)
  try {
    const response = await fetch(target.url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "easner-signature": signMerchantWebhookPayload({
          secret: target.secret,
          body,
          timestampSeconds,
        }),
        "easner-event": String(event),
      },
      body,
      signal: AbortSignal.timeout(DELIVERY_TIMEOUT_MS),
    })
    if (response.ok) return { delivered: true, status: response.status }
    return {
      delivered: false,
      status: response.status,
      error: `Endpoint replied with ${response.status}`,
    }
  } catch (e) {
    const error = e instanceof Error ? e.message : "Webhook delivery failed"
    return { delivered: false, error }
  }
}

function nextRetryAt(attempts: number, nowMs: number): string | null {
  const delay = MERCHANT_WEBHOOK_RETRY_DELAYS_SECONDS[attempts - 1]
  if (delay === undefined) return null
  return new Date(nowMs + delay * 1000).toISOString()
}

async function recordAttempt(
  admin: SupabaseClient,
  deliveryId: string,
  attempts: number,
  result: MerchantWebhookAttemptResult,
): Promise<void> {
  const now = new Date()
  const retryAt = result.delivered ? null : nextRetryAt(attempts, now.getTime())
  await admin
    .from("merchant_webhook_deliveries")
    .update({
      status: result.delivered ? "delivered" : retryAt ? "pending" : "failed",
      attempts,
      last_attempt_at: now.toISOString(),
      next_retry_at: retryAt,
      response_status: result.status ?? null,
      last_error: result.delivered ? null : (result.error ?? null),
      ...(result.delivered ? { delivered_at: now.toISOString() } : {}),
      updated_at: now.toISOString(),
    })
    .eq("id", deliveryId)
}

/**
 * POST a signed Easner event to the merchant endpoint configured on /checkout.
 *
 * Durable: the delivery is recorded in `merchant_webhook_deliveries` first, then
 * attempted in-line; failures are retried on a backoff schedule by
 * `/api/internal/checkout/retry-webhooks`. Never throws, so settlement is not
 * blocked by a merchant outage.
 */
export async function dispatchMerchantWebhook(
  admin: SupabaseClient,
  input: {
    businessId: string
    event: MerchantWebhookEvent
    data: Record<string, unknown>
  },
): Promise<MerchantWebhookAttemptResult> {
  const target = await resolveWebhookTarget(admin, input.businessId)
  if (!target) return { delivered: false }

  const payload = {
    type: input.event,
    created: Math.floor(Date.now() / 1000),
    data: input.data,
  }
  const body = JSON.stringify(payload)

  const { data: deliveryRow, error: insertError } = await admin
    .from("merchant_webhook_deliveries")
    .insert({
      business_id: input.businessId,
      event: input.event,
      payload,
      url: target.url,
      status: "pending",
      attempts: 0,
    })
    .select("id")
    .single()

  const result = await attemptDelivery(target, input.event, body)

  if (deliveryRow?.id) {
    await recordAttempt(admin, String(deliveryRow.id), 1, result)
  } else if (insertError) {
    // Deliveries table not provisioned yet – the attempt above already ran, so
    // behavior degrades to the legacy fire-and-forget send.
    if (!result.delivered) {
      console.warn(
        "[checkout] merchant webhook failed (no delivery log)",
        input.businessId,
        input.event,
        result.error ?? result.status,
      )
    }
  }

  return result
}

/**
 * Retry cron: re-attempt pending deliveries whose backoff has elapsed. Secrets
 * and URLs are re-resolved per attempt so a rotated secret or moved endpoint is
 * honored on retries.
 */
export async function processPendingMerchantWebhookDeliveries(
  admin: SupabaseClient,
  options?: { limit?: number },
): Promise<{ attempted: number; delivered: number; failed: number }> {
  const limit = options?.limit ?? 50
  const nowIso = new Date().toISOString()
  const { data: rows } = await admin
    .from("merchant_webhook_deliveries")
    .select("id, business_id, event, payload, attempts")
    .eq("status", "pending")
    .lte("next_retry_at", nowIso)
    .not("next_retry_at", "is", null)
    .order("next_retry_at", { ascending: true })
    .limit(limit)

  let delivered = 0
  let failed = 0
  const targets = new Map<string, WebhookTarget | null>()

  for (const row of rows ?? []) {
    const businessId = String(row.business_id)
    if (!targets.has(businessId)) {
      targets.set(businessId, await resolveWebhookTarget(admin, businessId))
    }
    const target = targets.get(businessId) ?? null
    const attempts = Number(row.attempts ?? 0) + 1

    if (!target) {
      await recordAttempt(admin, String(row.id), MERCHANT_WEBHOOK_MAX_ATTEMPTS, {
        delivered: false,
        error: "Webhook endpoint removed",
      })
      failed += 1
      continue
    }

    const result = await attemptDelivery(target, String(row.event), JSON.stringify(row.payload))
    await recordAttempt(admin, String(row.id), attempts, result)
    if (result.delivered) delivered += 1
    else failed += 1
  }

  return { attempted: rows?.length ?? 0, delivered, failed }
}

/** Manual redeliver from the dashboard – works on delivered and failed rows alike. */
export async function redeliverMerchantWebhook(
  admin: SupabaseClient,
  input: { businessId: string; deliveryId: string },
): Promise<MerchantWebhookAttemptResult & { found: boolean }> {
  const { data: row } = await admin
    .from("merchant_webhook_deliveries")
    .select("id, event, payload, attempts")
    .eq("id", input.deliveryId)
    .eq("business_id", input.businessId)
    .maybeSingle()
  if (!row?.id) return { found: false, delivered: false }

  const target = await resolveWebhookTarget(admin, input.businessId)
  if (!target) {
    return { found: true, delivered: false, error: "Add an endpoint URL and signing secret first" }
  }

  const result = await attemptDelivery(target, String(row.event), JSON.stringify(row.payload))
  await recordAttempt(admin, String(row.id), Number(row.attempts ?? 0) + 1, result)
  return { found: true, ...result }
}
