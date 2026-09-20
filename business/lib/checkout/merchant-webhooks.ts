import type { SupabaseClient } from "@supabase/supabase-js"
import { DEFAULT_WEBHOOK_EVENTS } from "@/lib/platform/scopes"
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
  "account.updated",
  "customer.created",
  "customer.updated",
  "transfer.created",
  "transfer.completed",
  "transfer.failed",
  "transaction.created",
] as const

export type MerchantWebhookEvent = (typeof MERCHANT_WEBHOOK_EVENTS)[number]

export const MERCHANT_WEBHOOK_EVENT_DESCRIPTIONS: Record<MerchantWebhookEvent, string> = {
  "checkout.completed": "Payment succeeded – safe to fulfil the order.",
  "checkout.async_succeeded": "A delayed method (such as bank debit) finally cleared.",
  "checkout.failed": "The payment attempt failed or was abandoned.",
  "payment.available": "Funds landed in the Easner Balance and are available to use.",
  "subscription.updated": "A recurring payment renewed or its plan changed.",
  "subscription.canceled": "A recurring payment was cancelled.",
  "account.updated": "A platform account balance or status changed.",
  "customer.created": "A customer was created through the API.",
  "customer.updated": "A customer record changed.",
  "transfer.created": "A transfer was created.",
  "transfer.completed": "A transfer finished.",
  "transfer.failed": "A transfer failed.",
  "transaction.created": "A platform ledger entry was written.",
}

export function normalizeSubscribedWebhookEvents(raw: unknown): MerchantWebhookEvent[] {
  if (!Array.isArray(raw)) return [...DEFAULT_WEBHOOK_EVENTS]
  const allowed = new Set<string>(MERCHANT_WEBHOOK_EVENTS)
  return raw.map(String).filter((event): event is MerchantWebhookEvent => allowed.has(event))
}

const DELIVERY_TIMEOUT_MS = 8000
const MAX_ATTEMPTS = 5
/** 1m, 5m, 30m, 2h, 24h */
const BACKOFF_MS = [60_000, 5 * 60_000, 30 * 60_000, 2 * 60 * 60_000, 24 * 60 * 60_000]

export type CheckoutWebhookDeliveryStatus = "pending" | "delivered" | "failed"

export type CheckoutWebhookDelivery = {
  id: string
  businessId: string
  event: MerchantWebhookEvent
  payload: Record<string, unknown>
  status: CheckoutWebhookDeliveryStatus
  attemptCount: number
  lastStatusCode: number | null
  lastError: string | null
  createdAt: string
  deliveredAt: string | null
  nextAttemptAt: string | null
}

function nextAttemptAt(attemptCount: number, from = Date.now()): string | null {
  const delay = BACKOFF_MS[Math.min(attemptCount, BACKOFF_MS.length) - 1]
  if (attemptCount >= MAX_ATTEMPTS) return null
  return new Date(from + (delay ?? BACKOFF_MS[BACKOFF_MS.length - 1])).toISOString()
}

function mapDelivery(row: Record<string, unknown>): CheckoutWebhookDelivery {
  return {
    id: String(row.id),
    businessId: String(row.business_id),
    event: row.event as MerchantWebhookEvent,
    payload: (row.payload && typeof row.payload === "object" ? row.payload : {}) as Record<string, unknown>,
    status: (row.status as CheckoutWebhookDeliveryStatus) || "pending",
    attemptCount: Number(row.attempt_count ?? 0),
    lastStatusCode: typeof row.last_status_code === "number" ? row.last_status_code : null,
    lastError: typeof row.last_error === "string" ? row.last_error : null,
    createdAt: String(row.created_at ?? ""),
    deliveredAt: typeof row.delivered_at === "string" ? row.delivered_at : null,
    nextAttemptAt: typeof row.next_attempt_at === "string" ? row.next_attempt_at : null,
  }
}

async function postSignedWebhook(input: {
  url: string
  secret: string
  event: MerchantWebhookEvent
  body: string
  timestampSeconds: number
}): Promise<{ ok: boolean; status?: number; error?: string; responseBody?: string }> {
  try {
    const response = await fetch(input.url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "easner-signature": signMerchantWebhookPayload({
          secret: input.secret,
          body: input.body,
          timestampSeconds: input.timestampSeconds,
        }),
        "easner-event": input.event,
      },
      body: input.body,
      signal: AbortSignal.timeout(DELIVERY_TIMEOUT_MS),
    })
    const responseBody = await response.text().catch(() => "")
    return {
      ok: response.ok,
      status: response.status,
      responseBody: responseBody.slice(0, 2000),
    }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Webhook delivery failed" }
  }
}

async function loadEndpoint(
  admin: SupabaseClient,
  businessId: string,
): Promise<{ url: string; secret: string; events: MerchantWebhookEvent[] } | null> {
  let settings: {
    webhook_url?: string | null
    webhook_secret_ciphertext?: string | null
    webhook_events?: unknown
  } | null = null
  const withEvents = await admin
    .from("business_checkout_settings")
    .select("webhook_url, webhook_secret_ciphertext, webhook_events")
    .eq("business_id", businessId)
    .maybeSingle()
  if (withEvents.error) {
    const fallback = await admin
      .from("business_checkout_settings")
      .select("webhook_url, webhook_secret_ciphertext")
      .eq("business_id", businessId)
      .maybeSingle()
    settings = fallback.data
  } else {
    settings = withEvents.data
  }
  const url = typeof settings?.webhook_url === "string" ? settings.webhook_url.trim() : ""
  const secret = decryptCheckoutSecret(settings?.webhook_secret_ciphertext as string | null)
  if (!url || !secret) return null
  return {
    url,
    secret,
    events: normalizeSubscribedWebhookEvents(settings?.webhook_events),
  }
}

async function attemptDelivery(
  admin: SupabaseClient,
  row: {
    id: string
    business_id: string
    event: string
    payload: Record<string, unknown>
    attempt_count: number
  },
): Promise<{ delivered: boolean; status?: number; error?: string }> {
  const endpoint = await loadEndpoint(admin, row.business_id)
  const attemptCount = Number(row.attempt_count ?? 0) + 1
  const now = new Date().toISOString()
  if (!endpoint) {
    await admin
      .from("checkout_webhook_deliveries")
      .update({
        status: attemptCount >= MAX_ATTEMPTS ? "failed" : "pending",
        attempt_count: attemptCount,
        last_attempt_at: now,
        last_error: "Webhook URL or signing secret is missing",
        next_attempt_at: nextAttemptAt(attemptCount),
        updated_at: now,
      })
      .eq("id", row.id)
    return { delivered: false, error: "Add an endpoint URL and signing secret first." }
  }

  const timestampSeconds =
    typeof row.payload.created === "number" ? row.payload.created : Math.floor(Date.now() / 1000)
  const body = JSON.stringify(row.payload)
  const result = await postSignedWebhook({
    url: endpoint.url,
    secret: endpoint.secret,
    event: row.event as MerchantWebhookEvent,
    body,
    timestampSeconds,
  })

  if (result.ok) {
    await admin
      .from("checkout_webhook_deliveries")
      .update({
        status: "delivered",
        attempt_count: attemptCount,
        last_attempt_at: now,
        last_status_code: result.status ?? 200,
        last_error: null,
        response_body: result.responseBody ?? null,
        delivered_at: now,
        next_attempt_at: null,
        updated_at: now,
      })
      .eq("id", row.id)
    return { delivered: true, status: result.status ?? 200 }
  }

  const failed = attemptCount >= MAX_ATTEMPTS
  await admin
    .from("checkout_webhook_deliveries")
    .update({
      status: failed ? "failed" : "pending",
      attempt_count: attemptCount,
      last_attempt_at: now,
      last_status_code: result.status ?? null,
      last_error: result.error ?? (result.status ? `HTTP ${result.status}` : "Webhook delivery failed"),
      response_body: result.responseBody ?? null,
      next_attempt_at: failed ? null : nextAttemptAt(attemptCount),
      updated_at: now,
    })
    .eq("id", row.id)

  if (!failed) {
    console.warn("[checkout] merchant webhook failed", row.business_id, row.event, result.error)
  }
  return { delivered: false, status: result.status, error: result.error }
}

/**
 * Queue a signed Easner event and attempt delivery immediately.
 * Best-effort: never throws, so settlement is not blocked by a merchant outage.
 */
export async function dispatchMerchantWebhook(
  admin: SupabaseClient,
  input: {
    businessId: string
    event: MerchantWebhookEvent
    data: Record<string, unknown>
  },
): Promise<{ delivered: boolean; status?: number; error?: string; deliveryId?: string }> {
  const endpoint = await loadEndpoint(admin, input.businessId)
  if (!endpoint) return { delivered: false }
  if (!endpoint.events.includes(input.event)) return { delivered: false }

  const timestampSeconds = Math.floor(Date.now() / 1000)
  const payload = {
    type: input.event,
    created: timestampSeconds,
    data: input.data,
  }

  const { data: inserted, error: insertError } = await admin
    .from("checkout_webhook_deliveries")
    .insert({
      business_id: input.businessId,
      event: input.event,
      payload,
      status: "pending",
      attempt_count: 0,
      next_attempt_at: new Date().toISOString(),
    })
    .select("id, business_id, event, payload, attempt_count")
    .single()

  if (insertError || !inserted?.id) {
    console.warn("[checkout] webhook delivery insert failed", input.businessId, insertError?.message)
    const body = JSON.stringify(payload)
    const result = await postSignedWebhook({
      url: endpoint.url,
      secret: endpoint.secret,
      event: input.event,
      body,
      timestampSeconds,
    })
    return { delivered: result.ok, status: result.status, error: result.error }
  }

  const result = await attemptDelivery(admin, {
    id: String(inserted.id),
    business_id: String(inserted.business_id),
    event: String(inserted.event),
    payload: payload,
    attempt_count: 0,
  })
  return { ...result, deliveryId: String(inserted.id) }
}

export async function listCheckoutWebhookDeliveries(
  admin: SupabaseClient,
  businessId: string,
  limit = 25,
): Promise<CheckoutWebhookDelivery[]> {
  const { data } = await admin
    .from("checkout_webhook_deliveries")
    .select(
      "id, business_id, event, payload, status, attempt_count, last_status_code, last_error, created_at, delivered_at, next_attempt_at",
    )
    .eq("business_id", businessId)
    .order("created_at", { ascending: false })
    .limit(limit)
  return (data ?? []).map((row) => mapDelivery(row as Record<string, unknown>))
}

export async function redeliverCheckoutWebhook(
  admin: SupabaseClient,
  input: { businessId: string; deliveryId: string },
): Promise<{ delivered: boolean; status?: number; error?: string }> {
  const { data } = await admin
    .from("checkout_webhook_deliveries")
    .select("id, business_id, event, payload, attempt_count")
    .eq("id", input.deliveryId)
    .eq("business_id", input.businessId)
    .maybeSingle()
  if (!data?.id) return { delivered: false, error: "Delivery not found" }
  return attemptDelivery(admin, {
    id: String(data.id),
    business_id: String(data.business_id),
    event: String(data.event),
    payload: (data.payload ?? {}) as Record<string, unknown>,
    attempt_count: Number(data.attempt_count ?? 0),
  })
}

export async function retryDueCheckoutWebhooks(
  admin: SupabaseClient,
  limit = 50,
): Promise<{ attempted: number; delivered: number }> {
  const now = new Date().toISOString()
  const { data } = await admin
    .from("checkout_webhook_deliveries")
    .select("id, business_id, event, payload, attempt_count")
    .eq("status", "pending")
    .lte("next_attempt_at", now)
    .lt("attempt_count", MAX_ATTEMPTS)
    .order("next_attempt_at", { ascending: true })
    .limit(limit)

  let delivered = 0
  for (const row of data ?? []) {
    const result = await attemptDelivery(admin, {
      id: String(row.id),
      business_id: String(row.business_id),
      event: String(row.event),
      payload: (row.payload ?? {}) as Record<string, unknown>,
      attempt_count: Number(row.attempt_count ?? 0),
    })
    if (result.delivered) delivered += 1
  }
  return { attempted: (data ?? []).length, delivered }
}
