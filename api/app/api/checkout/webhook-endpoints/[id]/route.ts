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

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getUserFromApiRequest(request)
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const ctx = await requireEasnerBusinessId(user.id)
  if (!ctx.ok) return ctx.response
  const { id } = await context.params

  const body = (await request.json().catch(() => null)) as
    | { url?: string; description?: string; events?: string[]; rotate_secret?: boolean }
    | null

  const admin = createSupabaseAdmin()
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
  let secret: string | null = null

  if (body?.url !== undefined) {
    const url = normalizeReturnUrl(String(body.url ?? ""))
    if (!url) return NextResponse.json({ error: "Enter a full https:// address" }, { status: 400 })
    patch.url = url
  }
  if (body?.description !== undefined) {
    patch.description = body.description.trim().slice(0, 200) || null
  }
  if (body?.events !== undefined) {
    const events = parseEvents(body.events)
    if (events.length === 0) {
      return NextResponse.json({ error: "Choose at least one event to subscribe to" }, { status: 400 })
    }
    patch.events = events
  }
  if (body?.rotate_secret) {
    secret = generateWebhookSigningSecret()
    const { ciphertext } = encryptCheckoutSecret(secret)
    patch.webhook_secret_ciphertext = ciphertext
    patch.webhook_secret_last4 = checkoutKeyLast4(secret)
  }

  const { data: updated, error } = await admin
    .from("platform_webhook_endpoints")
    .update(patch)
    .eq("id", id)
    .eq("business_id", ctx.businessId)
    .select("id, url, description, livemode, events, webhook_secret_last4, created_at")
    .single()

  if (error || !updated) {
    return NextResponse.json({ error: error?.message || "Could not update endpoint" }, { status: 400 })
  }

  recordPlatformAudit(admin, {
    businessId: ctx.businessId,
    actorUserId: user.id,
    action: "webhook_endpoint.updated",
    targetType: "platform_webhook_endpoint",
    targetId: id,
    metadata: { rotatedSecret: Boolean(secret) },
  })

  return NextResponse.json({ endpoint: updated, secret })
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getUserFromApiRequest(request)
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const ctx = await requireEasnerBusinessId(user.id)
  if (!ctx.ok) return ctx.response
  const { id } = await context.params

  const admin = createSupabaseAdmin()
  const { error } = await admin
    .from("platform_webhook_endpoints")
    .update({ disabled_at: new Date().toISOString() })
    .eq("id", id)
    .eq("business_id", ctx.businessId)

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  recordPlatformAudit(admin, {
    businessId: ctx.businessId,
    actorUserId: user.id,
    action: "webhook_endpoint.disabled",
    targetType: "platform_webhook_endpoint",
    targetId: id,
  })

  return NextResponse.json({ ok: true })
}
