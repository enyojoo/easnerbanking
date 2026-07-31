import { NextResponse } from "next/server"
import { createSupabaseAdmin } from "@/lib/supabase/admin"
import { recordEventInbox, markEventInboxProcessed } from "@/lib/webhooks/event-inbox"
import { isTurnkeyWebhookEd25519SigningConfigured } from "@/lib/turnkey/turnkey-webhook-signing-keys"
import {
  turnkeyWebhookVerifyInputFromHeaders,
  verifyTurnkeyWebhookSignature,
} from "@/lib/turnkey/webhook-verify"
import { applyTurnkeyBalanceWebhookSideEffects } from "@/lib/turnkey/balance-webhook-sync"
import { applyTurnkeyWebhookSideEffects } from "@/lib/turnkey/chain-sync"
import {
  isTurnkeyWebhookAllowUnsignedEnabled,
  isTurnkeyWebhookStrictSignatureEnabled,
} from "@/lib/turnkey/config"
import { parseTurnkeyBalanceWebhookPayload } from "@/lib/turnkey/turnkey-balance-webhook-payload"
import {
  isV2TurnkeyWebhookDelivery,
  readTurnkeyWebhookHeaders,
  readTurnkeyWebhookRawBody,
  resolveTurnkeyWebhookInboxIdentity,
  turnkeySignatureMetaFromHeaders,
  validateTurnkeyWebhookOrganizationId,
  validateTurnkeyWebhookTimestamp,
} from "@/lib/turnkey/turnkey-webhook-delivery"

export const runtime = "nodejs"
/** Webhook signature is over exact request bytes; never statically optimize this route. */
export const dynamic = "force-dynamic"

function isEd25519V1SignatureMeta(meta: ReturnType<typeof turnkeySignatureMetaFromHeaders>): boolean {
  return (
    meta.algorithm?.trim().toLowerCase() === "ed25519" &&
    meta.version?.trim().toLowerCase() === "v1" &&
    (meta.keyId?.trim() || "turnkey_webhook_signing_key_001") === "turnkey_webhook_signing_key_001"
  )
}

function canCompatibilityAcceptTurnkeyV2SignatureFailure(
  headers: ReturnType<typeof readTurnkeyWebhookHeaders>,
  meta: ReturnType<typeof turnkeySignatureMetaFromHeaders>,
  ed25519Configured: boolean,
): boolean {
  if (isTurnkeyWebhookStrictSignatureEnabled()) return false
  return Boolean(
    ed25519Configured &&
      headers.signature &&
      headers.organizationId &&
      headers.eventId &&
      headers.timestamp &&
      isV2TurnkeyWebhookDelivery(headers) &&
      isEd25519V1SignatureMeta(meta),
  )
}

/**
 * Turnkey webhooks (activity + balance confirmed/finalized) — V2 headers, verify, `event_inbox`.
 * Balance deposits dedupe on `tx_hash`; confirmed and finalized may both be subscribed.
 */
export async function POST(request: Request) {
  const headers = readTurnkeyWebhookHeaders(request)
  const raw = await readTurnkeyWebhookRawBody(request)
  const secretConfigured = Boolean(process.env.TURNKEY_WEBHOOK_SECRET?.trim())
  const ed25519Configured = isTurnkeyWebhookEd25519SigningConfigured()
  if (process.env.NODE_ENV === "production" && !secretConfigured && !ed25519Configured) {
    console.error(
      "turnkey_webhook_rejected: configure TURNKEY_WEBHOOK_SIGNING_PUBLIC_KEY (V2 ed25519) or TURNKEY_WEBHOOK_SECRET (legacy HMAC)",
    )
    return NextResponse.json({ error: "webhook_verify_not_configured" }, { status: 503 })
  }

  const allowUnsigned = isTurnkeyWebhookAllowUnsignedEnabled()

  const sig = headers.signature
  const sigMeta = turnkeySignatureMetaFromHeaders(headers)

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

  if (sig) {
    const verifyInput = turnkeyWebhookVerifyInputFromHeaders(raw, headers, sigMeta)
    if (!verifyTurnkeyWebhookSignature(verifyInput)) {
      const compatibilityAccepted =
        orgError === null && canCompatibilityAcceptTurnkeyV2SignatureFailure(headers, sigMeta, ed25519Configured)
      if (!compatibilityAccepted) {
        if (isTurnkeyWebhookStrictSignatureEnabled()) {
          console.warn("turnkey_webhook: strict signature rejected (401). Remove TURNKEY_WEBHOOK_STRICT_SIGNATURE to use compatibility mode.", {
            eventId: headers.eventId,
            contentType: request.headers.get("content-type"),
            contentEncoding: request.headers.get("content-encoding"),
          })
        }
        return NextResponse.json({ error: "Invalid webhook signature" }, { status: 401 })
      }
      console.info("turnkey_webhook: signed V2 delivery accepted in signature compatibility mode", {
        keyId: sigMeta.keyId,
        algorithm: sigMeta.algorithm,
        version: sigMeta.version,
        eventId: headers.eventId,
        eventType: headers.eventType,
      })
    }
  } else if (secretConfigured || ed25519Configured) {
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
