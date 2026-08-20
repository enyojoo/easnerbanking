import { getTurnkeyOrganizationId } from "@/lib/turnkey/config"
import { turnkeyWebhookInboxIdentity } from "@/lib/turnkey/turnkey-balance-webhook-payload"

/** Webhooks V2 delivery headers (https://docs.turnkey.com – preview). */
export type TurnkeyWebhookHeaders = {
  organizationId: string | null
  eventType: string | null
  eventId: string | null
  timestamp: string | null
  webhookVersion: string | null
  signatureKeyId: string | null
  signatureAlgorithm: string | null
  signatureVersion: string | null
  signature: string | null
}

export type TurnkeyWebhookSignatureMeta = {
  keyId: string | null
  algorithm: string | null
  version: string | null
}

const TIMESTAMP_MAX_SKEW_MS = 5 * 60 * 1000

function trimHeader(value: string | null): string | null {
  const s = value?.trim()
  return s ? s : null
}

function header(request: Request, name: string): string | null {
  return trimHeader(request.headers.get(name) ?? request.headers.get(name.toLowerCase()))
}

/** Read the exact webhook body bytes Turnkey signed (never call `request.json()` before verify). */
export async function readTurnkeyWebhookRawBody(request: Request): Promise<Buffer> {
  return Buffer.from(await request.arrayBuffer())
}

export function readTurnkeyWebhookHeaders(request: Request): TurnkeyWebhookHeaders {
  const signature =
    header(request, "X-Turnkey-Signature") ||
    header(request, "X-Webhook-Signature") ||
    header(request, "Webhook-Signature") ||
    header(request, "webhook-signature") ||
    header(request, "svix-signature")

  return {
    organizationId: header(request, "X-Turnkey-Organization-Id"),
    eventType: header(request, "X-Turnkey-Event-Type"),
    eventId: header(request, "X-Turnkey-Event-Id"),
    timestamp: header(request, "X-Turnkey-Timestamp"),
    webhookVersion: header(request, "X-Turnkey-Webhook-Version"),
    signatureKeyId: header(request, "X-Turnkey-Signature-Key-Id"),
    signatureAlgorithm: header(request, "X-Turnkey-Signature-Algorithm"),
    signatureVersion: header(request, "X-Turnkey-Signature-Version"),
    signature,
  }
}

export function turnkeySignatureMetaFromHeaders(
  headers: TurnkeyWebhookHeaders,
): TurnkeyWebhookSignatureMeta {
  return {
    keyId: headers.signatureKeyId,
    algorithm: headers.signatureAlgorithm,
    version: headers.signatureVersion,
  }
}

/** Prefer V2 `X-Turnkey-Event-Id` / `X-Turnkey-Event-Type`, fall back to body. */
export function resolveTurnkeyWebhookInboxIdentity(
  payload: unknown,
  headers: TurnkeyWebhookHeaders,
): { eventId: string; eventType: string } | null {
  const fromBody = turnkeyWebhookInboxIdentity(payload)
  const eventId = headers.eventId || fromBody?.eventId || ""
  if (!eventId) return null
  const eventType = headers.eventType || fromBody?.eventType || ""
  return { eventId, eventType }
}

/**
 * When V2 sends org id, it must match configured parent org.
 * Returns error code or null if ok / not applicable.
 */
export function validateTurnkeyWebhookOrganizationId(
  organizationId: string | null,
): "organization_mismatch" | "organization_not_configured" | null {
  if (!organizationId) return null
  const expected = getTurnkeyOrganizationId()
  if (!expected) return "organization_not_configured"
  if (organizationId !== expected) return "organization_mismatch"
  return null
}

function parseTimestampMs(raw: string): number | null {
  const iso = Date.parse(raw)
  if (Number.isFinite(iso)) return iso
  const n = Number(raw)
  if (!Number.isFinite(n)) return null
  // Unix seconds vs milliseconds
  return n < 1e12 ? n * 1000 : n
}

/**
 * Reject stale deliveries when V2 sends `X-Turnkey-Timestamp`.
 * Returns error code or null if ok / header absent.
 */
export function validateTurnkeyWebhookTimestamp(
  timestamp: string | null,
  maxSkewMs = TIMESTAMP_MAX_SKEW_MS,
): "timestamp_invalid" | "timestamp_out_of_range" | null {
  if (!timestamp) return null
  const ms = parseTimestampMs(timestamp)
  if (ms == null) return "timestamp_invalid"
  if (Math.abs(Date.now() - ms) > maxSkewMs) return "timestamp_out_of_range"
  return null
}

export function isV2TurnkeyWebhookDelivery(headers: TurnkeyWebhookHeaders): boolean {
  return Boolean(
    headers.webhookVersion ||
      headers.eventId ||
      headers.signatureAlgorithm ||
      headers.signatureKeyId,
  )
}
