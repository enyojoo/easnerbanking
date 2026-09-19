import { NextResponse } from "next/server"
import { createSupabaseAdmin } from "@/lib/supabase/admin"
import {
  parseSesNotificationMessage,
  parseSnsEnvelope,
  verifySnsSignature,
} from "@easner/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * SES bounce/complaint (and SNS subscription confirm) via HTTPS.
 * Verify SNS signature — do not use the internal cron secret.
 */
export async function POST(request: Request) {
  const raw = await request.text()
  let envelope
  try {
    envelope = parseSnsEnvelope(raw)
  } catch {
    return NextResponse.json({ error: "invalid_sns_payload" }, { status: 400 })
  }

  const verified = await verifySnsSignature(envelope).catch((error) => {
    console.warn("[ses-sns] signature verify failed:", error instanceof Error ? error.message : error)
    return false
  })
  if (!verified) {
    return NextResponse.json({ error: "invalid_sns_signature" }, { status: 401 })
  }

  if (envelope.Type === "SubscriptionConfirmation" || envelope.Type === "UnsubscribeConfirmation") {
    const url = envelope.SubscribeURL?.trim()
    if (url && envelope.Type === "SubscriptionConfirmation") {
      const confirm = await fetch(url)
      if (!confirm.ok) {
        console.error("[ses-sns] subscription confirm fetch failed", confirm.status)
        return NextResponse.json({ error: "subscription_confirm_failed" }, { status: 502 })
      }
    }
    return NextResponse.json({ ok: true, type: envelope.Type })
  }

  if (envelope.Type !== "Notification" || !envelope.Message) {
    return NextResponse.json({ ok: true, ignored: true })
  }

  const event = parseSesNotificationMessage(envelope.Message)
  if (!event) {
    return NextResponse.json({ ok: true, ignored: true })
  }

  const admin = createSupabaseAdmin()
  const rows = event.emails.map((email) => ({
    email,
    reason: event.kind,
    source: "ses",
    raw: event.raw,
  }))
  const { error } = await admin.from("email_suppressions").upsert(rows, { onConflict: "email" })
  if (error) {
    console.error("[ses-sns] suppression upsert failed:", error.message)
    return NextResponse.json({ error: "upsert_failed" }, { status: 500 })
  }

  return NextResponse.json({ ok: true, suppressed: event.emails.length, reason: event.kind })
}
