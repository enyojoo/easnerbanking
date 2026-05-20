import { NextResponse } from "next/server"
import { createSupabaseAdmin } from "@/lib/supabase/admin"
import { recordEventInbox, markEventInboxProcessed } from "@/lib/webhooks/event-inbox"
import { verifyTurnkeyWebhookSignature } from "@/lib/turnkey/webhook-verify"
import { applyTurnkeyBalanceWebhookSideEffects } from "@/lib/turnkey/balance-webhook-sync"
import { applyTurnkeyWebhookSideEffects } from "@/lib/turnkey/chain-sync"
import { isTurnkeyBalanceConfirmedPayload } from "@/lib/turnkey/turnkey-webhook-classify"
import { parseTurnkeyBalanceWebhookPayload } from "@/lib/turnkey/turnkey-balance-webhook-payload"
import {
  isV2TurnkeyWebhookDelivery,
  readTurnkeyWebhookHeaders,
  resolveTurnkeyWebhookInboxIdentity,
  turnkeySignatureMetaFromHeaders,
  validateTurnkeyWebhookOrganizationId,
  validateTurnkeyWebhookTimestamp,
} from "@/lib/turnkey/turnkey-webhook-delivery"

export const runtime = "nodejs"

/**
 * Turnkey webhooks (activity + BALANCE_CONFIRMED_UPDATES) — V2 headers, verify, `event_inbox`.
 */
export async function POST(request: Request) {
  const headers = readTurnkeyWebhookHeaders(request)
  const raw = Buffer.from(await request.arrayBuffer())
  const secretConfigured = Boolean(process.env.TURNKEY_WEBHOOK_SECRET?.trim())
  if (process.env.NODE_ENV === "production" && !secretConfigured) {
    console.error("turnkey_webhook_rejected: TURNKEY_WEBHOOK_SECRET is not set on this deployment")
    return NextResponse.json({ error: "webhook_secret_not_configured" }, { status: 503 })
  }

  const allowUnsigned =
    process.env.TURNKEY_WEBHOOK_ALLOW_UNSIGNED === "true" || process.env.TURNKEY_WEBHOOK_ALLOW_UNSIGNED === "1"

  const sig = headers.signature
  const sigMeta = turnkeySignatureMetaFromHeaders(headers)

  if (sig) {
    if (!verifyTurnkeyWebhookSignature(raw, sig, sigMeta)) {
      return NextResponse.json({ error: "Invalid webhook signature" }, { status: 401 })
    }
  } else if (secretConfigured) {
    if (allowUnsigned && !isV2TurnkeyWebhookDelivery(headers)) {
      console.warn(
        "turnkey_webhook: unsigned legacy delivery accepted (TURNKEY_WEBHOOK_ALLOW_UNSIGNED). V2 deliveries must be signed.",
      )
    } else {
      return NextResponse.json(
        {
          error: "Missing webhook signature header",
          hint: "Webhooks V2 require X-Turnkey-Signature. Legacy unsigned activity webhooks need TURNKEY_WEBHOOK_ALLOW_UNSIGNED=true.",
        },
        { status: 401 },
      )
    }
  }

  const orgError = validateTurnkeyWebhookOrganizationId(headers.organizationId)
  if (orgError === "organization_mismatch") {
    return NextResponse.json({ error: "organization_mismatch" }, { status: 401 })
  }
  if (orgError === "organization_not_configured") {
    console.warn("turnkey_webhook: X-Turnkey-Organization-Id present but TURNKEY_ORGANIZATION_ID is not set")
  }

  const tsError = validateTurnkeyWebhookTimestamp(headers.timestamp)
  if (tsError) {
    return NextResponse.json({ error: tsError }, { status: 401 })
  }

  let payload: unknown
  try {
    payload = JSON.parse(raw.toString("utf8"))
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const identity = resolveTurnkeyWebhookInboxIdentity(payload, headers)
  if (!identity?.eventId) {
    return NextResponse.json({ error: "Missing event id on payload or X-Turnkey-Event-Id" }, { status: 400 })
  }

  const { eventId, eventType } = identity
  const p = payload as Record<string, unknown>

  const admin = createSupabaseAdmin()
  const { skipped } = await recordEventInbox(admin, {
    provider: "turnkey",
    eventId,
    eventType,
    payload: p,
  })
  if (skipped) {
    return NextResponse.json({ ok: true, skipped: true })
  }

  try {
    const balanceParsed = parseTurnkeyBalanceWebhookPayload(payload)
    if (balanceParsed.kind === "deposit") {
      await applyTurnkeyBalanceWebhookSideEffects(admin, balanceParsed.data, eventId)
    } else if (balanceParsed.kind === "withdraw") {
      /* withdraw confirmations are acknowledged but do not create ledger rows */
    } else if (isTurnkeyBalanceConfirmedPayload(p)) {
      console.warn("turnkey_webhook: balance-shaped payload could not be parsed for ingest", { eventId, eventType })
    } else {
      await applyTurnkeyWebhookSideEffects(admin, p, eventId)
    }
    await markEventInboxProcessed(admin, "turnkey", eventId, null)
    return NextResponse.json({ ok: true })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    try {
      await markEventInboxProcessed(admin, "turnkey", eventId, msg)
    } catch {
      /* best-effort */
    }
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
