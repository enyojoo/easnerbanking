import { NextResponse } from "next/server"
import {
  diagnoseYellowcardWebhookVerification,
  readYellowcardWebhookSignatureHeader,
} from "@/lib/yellowcard/webhook-verify"
import { recordYellowcardWebhookDelivery } from "@/lib/yellowcard/process-webhook"
import { getYellowcardApiSecret } from "@/lib/yellowcard/config"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * Yellowcard webhook ingress — verify `X-YC-Signature` (HMAC-SHA256 base64 of raw body).
 * Register this URL in the Yellowcard partner dashboard.
 */
export async function GET() {
  return NextResponse.json({
    ok: true,
    endpoint: "yellowcard-webhooks",
    secretConfigured: Boolean(getYellowcardApiSecret()),
    environment: process.env.YELLOWCARD_ENVIRONMENT?.trim() || "sandbox (default)",
  })
}

export async function POST(request: Request) {
  const raw = Buffer.from(await request.arrayBuffer())
  const sig = readYellowcardWebhookSignatureHeader(request)
  const diagnostic = diagnoseYellowcardWebhookVerification(raw, sig)

  if (!diagnostic.ok) {
    const code = diagnostic.code ?? "INVALID_SIGNATURE"
    console.warn("[yellowcard-webhook] verification failed", {
      code,
      bodyBytes: diagnostic.bodyBytes,
    })
    return NextResponse.json(
      {
        error:
          code === "MISSING_SIGNATURE"
            ? "Missing X-YC-Signature header"
            : code === "EMPTY_BODY"
              ? "Empty request body"
              : code === "SECRET_MISSING"
                ? "YELLOWCARD_API_SECRET not configured"
                : "Invalid X-YC-Signature",
        code,
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
    const { skipped } = await recordYellowcardWebhookDelivery(payload)
    return NextResponse.json({ ok: true, skipped })
  } catch (e) {
    console.error("yellowcard webhook:", e)
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Webhook processing failed" },
      { status: 500 },
    )
  }
}
