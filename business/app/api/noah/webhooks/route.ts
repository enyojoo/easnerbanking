import { NextResponse } from "next/server"
import {
  diagnoseNoahWebhookVerification,
  readNoahWebhookSignatureHeader,
} from "@/lib/noah/webhook-verify"
import { recordNoahWebhookAuthRejection } from "@/lib/noah/record-webhook-auth-rejection"
import { recordNoahWebhookDelivery } from "@/lib/noah/process-webhook"
import { getNoahWebhookVerifyPublicKeys } from "@/lib/noah/webhook-verify"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * Noah webhook ingress — verify `Webhook-Signature` (ECDSA SHA-384) over raw body per Noah docs.
 * Register this URL in the Noah production dashboard.
 */
export async function GET() {
  const keys = getNoahWebhookVerifyPublicKeys()
  return NextResponse.json({
    ok: true,
    endpoint: "noah-webhooks",
    keysConfigured: keys.length,
    noahWebhookEnv: process.env.NOAH_WEBHOOK_NOAH_ENV?.trim() || "production (default)",
    customPublicKey: Boolean(process.env.NOAH_WEBHOOK_PUBLIC_KEY?.trim()),
    allowUnsigned: process.env.NOAH_WEBHOOK_ALLOW_UNSIGNED === "true",
  })
}

export async function POST(request: Request) {
  const raw = Buffer.from(await request.arrayBuffer())
  const sig = readNoahWebhookSignatureHeader(request)
  const diagnostic = diagnoseNoahWebhookVerification(raw, sig)

  if (!diagnostic.ok) {
    const code = diagnostic.code ?? "INVALID_SIGNATURE"
    const relatedHeaders = [...request.headers.keys()].filter((name) => {
      const n = name.toLowerCase()
      return n.includes("webhook") || n.includes("signature")
    })

    console.warn("[noah-webhook] verification failed", {
      code,
      bodyBytes: diagnostic.bodyBytes,
      signatureCandidates: diagnostic.signatureCandidates,
      signatureBytes: diagnostic.signatureBytes,
      keysTried: diagnostic.keysTried,
      allowUnsigned: diagnostic.allowUnsigned,
      customPublicKey: Boolean(process.env.NOAH_WEBHOOK_PUBLIC_KEY?.trim()),
      relatedHeaders,
    })

    if (code !== "EMPTY_BODY") {
      await recordNoahWebhookAuthRejection({
        code,
        bodyBytes: diagnostic.bodyBytes,
        signatureBytes: diagnostic.signatureBytes,
        headerNames: relatedHeaders,
      })
    }

    const envHint = process.env.NOAH_WEBHOOK_NOAH_ENV?.trim() || "production (default)"
    return NextResponse.json(
      {
        error:
          code === "MISSING_SIGNATURE"
            ? "Missing Webhook-Signature header"
            : code === "EMPTY_BODY"
              ? "Empty request body"
              : "Invalid Webhook-Signature",
        code,
        hint:
          code === "MISSING_SIGNATURE"
            ? "Noah must send Webhook-Signature. Remove NOAH_WEBHOOK_PUBLIC_KEY from Vercel unless Noah gave you a custom key. Test pings without a signature will always fail."
            : code === "EMPTY_BODY"
              ? "Webhook body was empty — check proxies and that Noah POSTs JSON."
              : `Signature did not verify. Unset NOAH_WEBHOOK_PUBLIC_KEY if unsure. Set NOAH_WEBHOOK_NOAH_ENV=production or sandbox to match your Noah program (${envHint}). See Noah webhook configuration docs.`,
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
      { status: 500 },
    )
  }
}
