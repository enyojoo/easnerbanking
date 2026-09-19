import { createHmac, randomUUID, timingSafeEqual } from "node:crypto"
import { NextResponse } from "next/server"
import { createSupabaseAdmin } from "@/lib/supabase/admin"
import { getRelayApiKey } from "@/lib/relay/config"
import { recordEventInbox, markEventInboxProcessed } from "@/lib/webhooks/event-inbox"
import { processRelayWebhookEvent } from "@/lib/relay/process-relay-webhook"

export const runtime = "nodejs"

const MAX_WEBHOOK_AGE_SEC = 5 * 60

function safeEqualHex(a: string, b: string): boolean {
  try {
    const bufA = Buffer.from(a, "hex")
    const bufB = Buffer.from(b, "hex")
    if (bufA.length !== bufB.length) return false
    return timingSafeEqual(bufA, bufB)
  } catch {
    return false
  }
}

/** https://docs.relay.link/references/api/api_guides/webhooks */
function verifyRelayWebhookSignature(request: Request, rawBody: string): boolean {
  const apiKey = getRelayApiKey()
  if (!apiKey) return false

  const timestamp = String(request.headers.get("x-signature-timestamp") || "").trim()
  const signature = String(request.headers.get("x-signature-sha256") || "").trim()
  if (!timestamp || !signature) return false

  const ts = Number(timestamp)
  if (Number.isFinite(ts)) {
    const tsSec = ts > 1_000_000_000_000 ? Math.floor(ts / 1000) : ts
    if (Math.abs(Math.floor(Date.now() / 1000) - tsSec) > MAX_WEBHOOK_AGE_SEC) {
      return false
    }
  }

  const expected = createHmac("sha256", apiKey)
    .update(`${timestamp}.${rawBody}`)
    .digest("hex")

  return safeEqualHex(signature, expected)
}

export async function POST(request: Request) {
  const rawBody = await request.text()
  if (!verifyRelayWebhookSignature(request, rawBody)) {
    return NextResponse.json({ error: "invalid_signature" }, { status: 401 })
  }

  let payload: Record<string, unknown>
  try {
    payload = JSON.parse(rawBody) as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 })
  }

  const data = (payload.data ?? {}) as Record<string, unknown>
  const eventId = String(
    data.requestId ?? payload.eventId ?? payload.id ?? payload.requestId ?? randomUUID(),
  )
  const admin = createSupabaseAdmin()
  const inbox = await recordEventInbox(admin, {
    provider: "relay",
    eventId: `relay:${eventId}`,
    eventType: String(payload.event ?? payload.type ?? "relay.webhook"),
    payload,
  })
  if (inbox.skipped) {
    return NextResponse.json({ ok: true, skipped: true })
  }

  try {
    const result = await processRelayWebhookEvent(admin, {
      ...payload,
      requestId: String(data.requestId ?? payload.requestId ?? "").trim() || undefined,
      depositAddress: String(
        (data.depositAddress as { address?: string } | undefined)?.address ??
          data.depositAddress ??
          payload.depositAddress ??
          "",
      ).trim() || undefined,
    })
    await markEventInboxProcessed(admin, "relay", `relay:${eventId}`, result.ok ? null : result.error)
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 422 })
    }
    return NextResponse.json({ ok: true, flow: result.flow, action: result.action })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    await markEventInboxProcessed(admin, "relay", `relay:${eventId}`, msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
