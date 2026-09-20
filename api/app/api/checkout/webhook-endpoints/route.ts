import { NextResponse } from "next/server"
import { MERCHANT_WEBHOOK_EVENTS, type MerchantWebhookEvent } from "@/lib/checkout/merchant-webhooks"
import { normalizeReturnUrl } from "@/lib/checkout/normalize-checkout-url"
import { checkoutKeyLast4, encryptCheckoutSecret, generateWebhookSigningSecret } from "@/lib/checkout/secrets"
import { recordPlatformAudit } from "@/lib/platform/audit-log"
import { createSupabaseAdmin, getUserFromApiRequest } from "@/lib/supabase/admin"
import { requireEasnerBusinessId } from "@/lib/terminal/context"

function parseEvents(raw: unknown): MerchantWebhookEvent[] {
  const allowed = new Set<string>(MERCHANT_WEBHOOK_EVENTS)
  return (Array.isArray(raw) ? raw : []).map(String).filter((e): e is MerchantWebhookEvent => allowed.has(e))
}

export async function GET(request: Request) {
  const user = await getUserFromApiRequest(request)
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const ctx = await requireEasnerBusinessId(user.id)
  if (!ctx.ok) return ctx.response

  const admin = createSupabaseAdmin()
  const { data } = await admin
    .from("platform_webhook_endpoints")
    .select("id, url, description, livemode, events, webhook_secret_last4, disabled_at, created_at")
    .eq("business_id", ctx.businessId)
    .order("created_at", { ascending: false })

  return NextResponse.json({ endpoints: data ?? [] })
}

export async function POST(request: Request) {
  const user = await getUserFromApiRequest(request)
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const ctx = await requireEasnerBusinessId(user.id)
  if (!ctx.ok) return ctx.response

  const body = (await request.json().catch(() => null)) as
    | { url?: string; description?: string; events?: string[]; livemode?: boolean }
    | null

  const url = normalizeReturnUrl(String(body?.url ?? ""))
  if (!url) {
    return NextResponse.json({ error: "Enter a full https:// address for your webhook endpoint" }, { status: 400 })
  }
  const events = parseEvents(body?.events)
  if (events.length === 0) {
    return NextResponse.json({ error: "Choose at least one event to subscribe to" }, { status: 400 })
  }
  const description = typeof body?.description === "string" ? body.description.trim().slice(0, 200) || null : null
  const livemode = Boolean(body?.livemode)

  const secret = generateWebhookSigningSecret()
  const { ciphertext } = encryptCheckoutSecret(secret)

  const admin = createSupabaseAdmin()
  const { data: inserted, error } = await admin
    .from("platform_webhook_endpoints")
    .insert({
      business_id: ctx.businessId,
      url,
      description,
      livemode,
      events,
      webhook_secret_ciphertext: ciphertext,
      webhook_secret_last4: checkoutKeyLast4(secret),
    })
    .select("id, url, description, livemode, events, webhook_secret_last4, created_at")
    .single()

  if (error || !inserted) {
    return NextResponse.json({ error: error?.message || "Could not create endpoint" }, { status: 400 })
  }

  recordPlatformAudit(admin, {
    businessId: ctx.businessId,
    actorUserId: user.id,
    action: "webhook_endpoint.created",
    targetType: "platform_webhook_endpoint",
    targetId: inserted.id as string,
    metadata: { url, events },
  })

  return NextResponse.json({ endpoint: inserted, secret }, { status: 201 })
}
