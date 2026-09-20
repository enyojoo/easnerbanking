import type { SupabaseClient } from "@supabase/supabase-js"
import { decryptCheckoutSecret, signMerchantWebhookPayload } from "./secrets"
import { normalizeSubscribedWebhookEvents, type MerchantWebhookEvent } from "./merchant-webhook-events"

export {
  MERCHANT_WEBHOOK_EVENTS,
  MERCHANT_WEBHOOK_EVENT_DESCRIPTIONS,
  normalizeSubscribedWebhookEvents,
  type MerchantWebhookEvent,
} from "./merchant-webhook-events"

const DELIVERY_TIMEOUT_MS = 8000
const MAX_ATTEMPTS = 5
/** 1m, 5m, 30m, 2h, 24h */
const BACKOFF_MS = [60_000, 5 * 60_000, 30 * 60_000, 2 * 60 * 60_000, 24 * 60 * 60_000]

export type CheckoutWebhookDeliveryStatus = "pending" | "delivered" | "failed"

export type CheckoutWebhookDelivery = {
  id: string
  endpointId: string
  eventId: string
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

type EndpointRow = {
  id: string
  url: string
  secret: string
  events: MerchantWebhookEvent[]
}

function nextAttemptAt(attemptCount: number, from = Date.now()): string | null {
  const delay = BACKOFF_MS[Math.min(attemptCount, BACKOFF_MS.length) - 1]
  if (attemptCount >= MAX_ATTEMPTS) return null
  return new Date(from + (delay ?? BACKOFF_MS[BACKOFF_MS.length - 1])).toISOString()
}

function mapDelivery(row: Record<string, unknown>, eventType: string, payload: Record<string, unknown>): CheckoutWebhookDelivery {
  return {
    id: String(row.id),
    endpointId: String(row.endpoint_id),
    eventId: String(row.event_id),
    businessId: String(row.business_id),
    event: eventType as MerchantWebhookEvent,
    payload,
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

/**
 * Every enabled endpoint for the business, regardless of the endpoint's own
 * `livemode` tag — that tag is organizational (which console tab an
 * endpoint shows under), not a delivery filter. Mirrors the pre-multi-endpoint
 * behavior, where one shared config received both test and live events;
 * filtering by mode here would silently stop live deliveries to any endpoint
 * migrated from that single-config era.
 */
async function loadEnabledEndpoints(admin: SupabaseClient, businessId: string): Promise<EndpointRow[]> {
  const { data } = await admin
    .from("platform_webhook_endpoints")
    .select("id, url, webhook_secret_ciphertext, events")
    .eq("business_id", businessId)
    .is("disabled_at", null)

  return (data ?? [])
    .map((row) => {
      const url = typeof row.url === "string" ? row.url.trim() : ""
      const secret = decryptCheckoutSecret(row.webhook_secret_ciphertext as string | null)
      if (!url || !secret) return null
      return {
        id: String(row.id),
        url,
        secret,
        events: normalizeSubscribedWebhookEvents(row.events),
      }
    })
    .filter((row): row is EndpointRow => row !== null)
}

async function attemptDelivery(
  admin: SupabaseClient,
  endpoint: EndpointRow,
  row: {
    id: string
    business_id: string
    event: string
    payload: Record<string, unknown>
    attempt_count: number
  },
): Promise<{ delivered: boolean; status?: number; error?: string }> {
  const attemptCount = Number(row.attempt_count ?? 0) + 1
  const now = new Date().toISOString()

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
      .from("platform_webhook_deliveries")
      .update({
        status: "delivered",
        attempt_count: attemptCount,
        last_status_code: result.status ?? 200,
        last_error: null,
        delivered_at: now,
        next_attempt_at: null,
        updated_at: now,
      })
      .eq("id", row.id)
    return { delivered: true, status: result.status ?? 200 }
  }

  const failed = attemptCount >= MAX_ATTEMPTS
  await admin
    .from("platform_webhook_deliveries")
    .update({
      status: failed ? "failed" : "pending",
      attempt_count: attemptCount,
      last_status_code: result.status ?? null,
      last_error: result.error ?? (result.status ? `HTTP ${result.status}` : "Webhook delivery failed"),
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
 * Record an Easner event and fan it out to every enabled endpoint subscribed
 * to it. Best-effort: never throws, so settlement is not blocked by a
 * merchant outage. Livemode is read off `data.livemode` (every public object
 * mapper sets it) rather than a new parameter, so this stays a drop-in
 * replacement at all 15+ existing call sites.
 */
export async function dispatchMerchantWebhook(
  admin: SupabaseClient,
  input: {
    businessId: string
    event: MerchantWebhookEvent
    data: Record<string, unknown>
  },
): Promise<{ delivered: boolean; status?: number; error?: string; deliveryId?: string; eventId?: string }> {
  const livemode = Boolean(input.data?.livemode)
  const timestampSeconds = Math.floor(Date.now() / 1000)
  const payload = {
    type: input.event,
    created: timestampSeconds,
    data: input.data,
  }

  const { data: eventRow, error: eventError } = await admin
    .from("platform_events")
    .insert({ business_id: input.businessId, livemode, type: input.event, payload })
    .select("id")
    .single()

  if (eventError || !eventRow?.id) {
    console.warn("[checkout] event insert failed", input.businessId, eventError?.message)
    return { delivered: false }
  }

  const endpoints = (await loadEnabledEndpoints(admin, input.businessId)).filter((e) =>
    e.events.includes(input.event),
  )
  if (endpoints.length === 0) return { delivered: false, eventId: String(eventRow.id) }

  let anyDelivered = false
  let lastStatus: number | undefined
  let lastError: string | undefined
  let firstDeliveryId: string | undefined

  for (const endpoint of endpoints) {
    const { data: deliveryRow, error: deliveryError } = await admin
      .from("platform_webhook_deliveries")
      .insert({
        endpoint_id: endpoint.id,
        event_id: eventRow.id,
        business_id: input.businessId,
        status: "pending",
        attempt_count: 0,
        next_attempt_at: new Date().toISOString(),
      })
      .select("id")
      .single()

    if (deliveryError || !deliveryRow?.id) {
      console.warn("[checkout] delivery insert failed", input.businessId, deliveryError?.message)
      continue
    }
    firstDeliveryId ??= String(deliveryRow.id)

    const result = await attemptDelivery(admin, endpoint, {
      id: String(deliveryRow.id),
      business_id: input.businessId,
      event: input.event,
      payload,
      attempt_count: 0,
    })
    if (result.delivered) anyDelivered = true
    lastStatus = result.status ?? lastStatus
    lastError = result.error ?? lastError
  }

  return {
    delivered: anyDelivered,
    status: lastStatus,
    error: anyDelivered ? undefined : lastError,
    deliveryId: firstDeliveryId,
    eventId: String(eventRow.id),
  }
}

/**
 * Console "send test event" — records a real Event (so it shows in the
 * Events feed) but delivers to exactly the one endpoint being tested, not
 * every endpoint subscribed to that event type. Testing endpoint A should
 * never spam endpoint B.
 */
export async function sendTestWebhook(
  admin: SupabaseClient,
  input: { businessId: string; endpointId: string; event: MerchantWebhookEvent; data: Record<string, unknown> },
): Promise<{ delivered: boolean; status?: number; error?: string }> {
  const { data: endpointRow } = await admin
    .from("platform_webhook_endpoints")
    .select("id, url, webhook_secret_ciphertext, events")
    .eq("id", input.endpointId)
    .eq("business_id", input.businessId)
    .maybeSingle()
  const url = typeof endpointRow?.url === "string" ? endpointRow.url.trim() : ""
  const secret = decryptCheckoutSecret(endpointRow?.webhook_secret_ciphertext as string | null)
  if (!endpointRow || !url || !secret) {
    return { delivered: false, error: "Add an endpoint URL and signing secret first." }
  }

  const livemode = Boolean(input.data?.livemode)
  const payload = { type: input.event, created: Math.floor(Date.now() / 1000), data: input.data }

  const { data: eventRow } = await admin
    .from("platform_events")
    .insert({ business_id: input.businessId, livemode, type: input.event, payload })
    .select("id")
    .single()

  const { data: deliveryRow } = await admin
    .from("platform_webhook_deliveries")
    .insert({
      endpoint_id: input.endpointId,
      event_id: eventRow?.id,
      business_id: input.businessId,
      status: "pending",
      attempt_count: 0,
      next_attempt_at: new Date().toISOString(),
    })
    .select("id")
    .single()

  if (!deliveryRow?.id) return { delivered: false, error: "Could not record the test delivery." }

  return attemptDelivery(
    admin,
    {
      id: String(endpointRow.id),
      url,
      secret,
      events: normalizeSubscribedWebhookEvents(endpointRow.events),
    },
    { id: String(deliveryRow.id), business_id: input.businessId, event: input.event, payload, attempt_count: 0 },
  )
}

async function loadDeliveryContext(
  admin: SupabaseClient,
  input: { businessId: string; deliveryId: string },
): Promise<{ endpoint: EndpointRow; row: { id: string; event: string; payload: Record<string, unknown>; attempt_count: number } } | null> {
  const { data } = await admin
    .from("platform_webhook_deliveries")
    .select("id, attempt_count, endpoint_id, event:platform_events(type, payload)")
    .eq("id", input.deliveryId)
    .eq("business_id", input.businessId)
    .maybeSingle()
  if (!data?.id) return null

  const { data: endpointRow } = await admin
    .from("platform_webhook_endpoints")
    .select("id, url, webhook_secret_ciphertext, events")
    .eq("id", data.endpoint_id as string)
    .maybeSingle()
  const url = typeof endpointRow?.url === "string" ? endpointRow.url.trim() : ""
  const secret = decryptCheckoutSecret(endpointRow?.webhook_secret_ciphertext as string | null)
  if (!endpointRow || !url || !secret) return null

  const eventInfo = data.event as unknown as { type: string; payload: Record<string, unknown> } | null
  if (!eventInfo) return null

  return {
    endpoint: { id: String(endpointRow.id), url, secret, events: normalizeSubscribedWebhookEvents(endpointRow.events) },
    row: {
      id: String(data.id),
      event: eventInfo.type,
      payload: eventInfo.payload ?? {},
      attempt_count: Number(data.attempt_count ?? 0),
    },
  }
}

export async function listCheckoutWebhookDeliveries(
  admin: SupabaseClient,
  businessId: string,
  limit = 25,
): Promise<CheckoutWebhookDelivery[]> {
  const { data } = await admin
    .from("platform_webhook_deliveries")
    .select(
      "id, endpoint_id, event_id, business_id, status, attempt_count, last_status_code, last_error, created_at, delivered_at, next_attempt_at, event:platform_events(type, payload)",
    )
    .eq("business_id", businessId)
    .order("created_at", { ascending: false })
    .limit(limit)

  return (data ?? []).map((row) => {
    const eventInfo = row.event as unknown as { type: string; payload: Record<string, unknown> } | null
    return mapDelivery(row as Record<string, unknown>, eventInfo?.type ?? "", eventInfo?.payload ?? {})
  })
}

export async function redeliverCheckoutWebhook(
  admin: SupabaseClient,
  input: { businessId: string; deliveryId: string },
): Promise<{ delivered: boolean; status?: number; error?: string }> {
  const context = await loadDeliveryContext(admin, input)
  if (!context) return { delivered: false, error: "Delivery not found" }
  return attemptDelivery(admin, context.endpoint, {
    ...context.row,
    business_id: input.businessId,
  })
}

export async function retryDueCheckoutWebhooks(
  admin: SupabaseClient,
  limit = 50,
): Promise<{ attempted: number; delivered: number }> {
  const now = new Date().toISOString()
  const { data } = await admin
    .from("platform_webhook_deliveries")
    .select("id, business_id, endpoint_id, attempt_count, event:platform_events(type, payload)")
    .eq("status", "pending")
    .lte("next_attempt_at", now)
    .lt("attempt_count", MAX_ATTEMPTS)
    .order("next_attempt_at", { ascending: true })
    .limit(limit)

  let delivered = 0
  for (const row of data ?? []) {
    const { data: endpointRow } = await admin
      .from("platform_webhook_endpoints")
      .select("id, url, webhook_secret_ciphertext, events")
      .eq("id", row.endpoint_id as string)
      .maybeSingle()
    const url = typeof endpointRow?.url === "string" ? endpointRow.url.trim() : ""
    const secret = decryptCheckoutSecret(endpointRow?.webhook_secret_ciphertext as string | null)
    if (!endpointRow || !url || !secret) continue

    const eventInfo = row.event as unknown as { type: string; payload: Record<string, unknown> } | null
    if (!eventInfo) continue

    const result = await attemptDelivery(
      admin,
      { id: String(endpointRow.id), url, secret, events: normalizeSubscribedWebhookEvents(endpointRow.events) },
      {
        id: String(row.id),
        business_id: String(row.business_id),
        event: eventInfo.type,
        payload: eventInfo.payload ?? {},
        attempt_count: Number(row.attempt_count ?? 0),
      },
    )
    if (result.delivered) delivered += 1
  }
  return { attempted: (data ?? []).length, delivered }
}
