import { NextResponse } from "next/server"
import { createSupabaseAdmin } from "@/lib/supabase/admin"
import { recordEventInbox, markEventInboxProcessed } from "@/lib/webhooks/event-inbox"
import { verifyTurnkeyWebhookSignature } from "@/lib/turnkey/webhook-verify"
import { applyTurnkeyWebhookSideEffects } from "@/lib/turnkey/chain-sync"

export const runtime = "nodejs"

/**
 * Turnkey activity webhooks — verify signature, dedupe via `event_inbox`.
 */
export async function POST(request: Request) {
  const raw = Buffer.from(await request.arrayBuffer())
  const secretConfigured = Boolean(process.env.TURNKEY_WEBHOOK_SECRET?.trim())
  if (process.env.NODE_ENV === "production" && !secretConfigured) {
    console.error("turnkey_webhook_rejected: TURNKEY_WEBHOOK_SECRET is not set on this deployment")
    return NextResponse.json({ error: "webhook_secret_not_configured" }, { status: 503 })
  }
  const sig =
    request.headers.get("X-Turnkey-Signature") ||
    request.headers.get("x-turnkey-signature") ||
    request.headers.get("X-Webhook-Signature")

  if (!verifyTurnkeyWebhookSignature(raw, sig)) {
    return NextResponse.json({ error: "Invalid webhook signature" }, { status: 401 })
  }

  let payload: unknown
  try {
    payload = JSON.parse(raw.toString("utf8"))
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const p = payload as Record<string, unknown>
  const eventId = String(p.id ?? p.eventId ?? p.activityId ?? p.hash ?? "").trim()
  if (!eventId) {
    return NextResponse.json({ error: "Missing event id on payload" }, { status: 400 })
  }

  const admin = createSupabaseAdmin()
  const { skipped } = await recordEventInbox(admin, {
    provider: "turnkey",
    eventId,
    eventType: String(p.type ?? p.eventType ?? ""),
    payload: p,
  })
  if (skipped) {
    return NextResponse.json({ ok: true, skipped: true })
  }

  try {
    await applyTurnkeyWebhookSideEffects(admin, p, eventId)
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
