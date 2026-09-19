import { NextResponse } from "next/server"
import {
  diagnoseBridgeWebhookVerification,
  readBridgeWebhookSignatureHeader,
} from "@/lib/bridge/webhook-verify"
import { recordBridgeWebhookDelivery } from "@/lib/bridge/process-webhook"
import { getBridgeWebhookPublicKey, getBridgeWebhookSecret, isBridgeConfigured } from "@/lib/bridge/config"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET() {
  return NextResponse.json({
    ok: true,
    endpoint: "bridge-webhooks",
    publicKeyConfigured: Boolean(getBridgeWebhookPublicKey() || getBridgeWebhookSecret()),
    apiConfigured: isBridgeConfigured(),
  })
}

export async function POST(request: Request) {
  const raw = Buffer.from(await request.arrayBuffer())
  const sig = readBridgeWebhookSignatureHeader(request)
  const diagnostic = diagnoseBridgeWebhookVerification(raw, sig)

  if (!diagnostic.ok) {
    const code = diagnostic.code ?? "INVALID_SIGNATURE"
    console.warn("[bridge-webhook] verification failed", { code, bodyBytes: diagnostic.bodyBytes })
    return NextResponse.json(
      {
        error:
          code === "MISSING_SIGNATURE"
            ? "Missing X-Webhook-Signature header"
            : code === "EMPTY_BODY"
              ? "Empty request body"
              : code === "PUBLIC_KEY_MISSING"
                ? "BRIDGE_WEBHOOK_PUBLIC_KEY not configured"
                : "Invalid X-Webhook-Signature",
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
    const { skipped } = await recordBridgeWebhookDelivery(payload)
    return NextResponse.json({ ok: true, skipped })
  } catch (e) {
    console.error("bridge webhook:", e)
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Webhook processing failed" },
      { status: 500 },
    )
  }
}
