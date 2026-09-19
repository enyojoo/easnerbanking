import { NextResponse } from "next/server"
import {
  diagnoseGridWebhookVerification,
  readGridWebhookSignatureHeader,
} from "@/lib/grid/webhook-verify"
import { recordGridWebhookDelivery } from "@/lib/grid/process-webhook"
import { getGridWebhookPublicKey, isGridConfigured } from "@/lib/grid/config"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET() {
  return NextResponse.json({
    ok: true,
    endpoint: "grid-webhooks",
    publicKeyConfigured: Boolean(getGridWebhookPublicKey()),
    apiConfigured: isGridConfigured(),
    environment: process.env.GRID_ENVIRONMENT?.trim() || "sandbox (default)",
  })
}

export async function POST(request: Request) {
  const raw = Buffer.from(await request.arrayBuffer())
  const sig = readGridWebhookSignatureHeader(request)
  const diagnostic = diagnoseGridWebhookVerification(raw, sig)

  if (!diagnostic.ok) {
    const code = diagnostic.code ?? "INVALID_SIGNATURE"
    console.warn("[grid-webhook] verification failed", { code, bodyBytes: diagnostic.bodyBytes })
    return NextResponse.json(
      {
        error:
          code === "MISSING_SIGNATURE"
            ? "Missing X-Grid-Signature header"
            : code === "EMPTY_BODY"
              ? "Empty request body"
              : code === "PUBLIC_KEY_MISSING"
                ? "GRID_WEBHOOK_PUBLIC_KEY not configured"
                : "Invalid X-Grid-Signature",
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
    const { skipped } = await recordGridWebhookDelivery(payload)
    return NextResponse.json({ ok: true, skipped })
  } catch (e) {
    console.error("grid webhook:", e)
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Webhook processing failed" },
      { status: 500 },
    )
  }
}
