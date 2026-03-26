import { NextResponse } from "next/server"
import { verifyNoahWebhookSignature } from "@/lib/noah/webhook-verify"
import { recordNoahWebhookDelivery } from "@/lib/noah/process-webhook"

export const runtime = "nodejs"

/**
 * Noah webhook ingress — verify `Webhook-Signature` (ECDSA SHA-384) over raw body per Noah docs.
 * Register this URL in the Noah dashboard (sandbox).
 */
export async function POST(request: Request) {
  const raw = Buffer.from(await request.arrayBuffer())
  const sig = request.headers.get("Webhook-Signature")
  if (!verifyNoahWebhookSignature(raw, sig)) {
    return NextResponse.json({ error: "Invalid Webhook-Signature" }, { status: 401 })
  }

  let payload: unknown
  try {
    payload = JSON.parse(raw.toString("utf8"))
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  try {
    const { skipped } = await recordNoahWebhookDelivery(payload)
    return NextResponse.json({ ok: true, skipped })
  } catch (e) {
    console.error("noah webhook:", e)
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Webhook processing failed" },
      { status: 500 }
    )
  }
}
