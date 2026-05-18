import { NextResponse } from "next/server"
import {
  readNoahWebhookSignatureHeader,
  verifyNoahWebhookSignature,
} from "@/lib/noah/webhook-verify"
import { recordNoahWebhookDelivery } from "@/lib/noah/process-webhook"

export const runtime = "nodejs"

/**
 * Noah webhook ingress — verify `Webhook-Signature` (ECDSA SHA-384) over raw body per Noah docs.
 * Register this URL in the Noah production dashboard.
 */
export async function POST(request: Request) {
  const raw = Buffer.from(await request.arrayBuffer())
  const sig = readNoahWebhookSignatureHeader(request)
  if (!sig?.trim()) {
    return NextResponse.json(
      {
        error: "Missing Webhook-Signature header",
        code: "MISSING_WEBHOOK_SIGNATURE",
        hint: "Noah must send Webhook-Signature on POST deliveries. Check the webhook URL points at this deployment.",
      },
      { status: 401 },
    )
  }
  if (!verifyNoahWebhookSignature(raw, sig)) {
    const envHint = process.env.NOAH_WEBHOOK_NOAH_ENV?.trim() || "production (default)"
    return NextResponse.json(
      {
        error: "Invalid Webhook-Signature",
        code: "INVALID_WEBHOOK_SIGNATURE",
        hint: `Verify NOAH_WEBHOOK_NOAH_ENV matches the Noah program (${envHint}). Sandbox and production use different public keys — see Noah webhook configuration docs.`,
      },
      { status: 401 },
    )
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
