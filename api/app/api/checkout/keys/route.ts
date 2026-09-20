import { NextResponse } from "next/server"
import {
  checkoutKeyLast4,
  generatePublishableKey,
  generateSecretKey,
  hashCheckoutSecretKey,
  parseCheckoutKeyMode,
} from "@/lib/checkout/secrets"
import { resolveConnectReadyForCheckout } from "@/lib/stripe/connect"
import { recordPlatformAudit } from "@/lib/platform/audit-log"
import { PLATFORM_KEY_SCOPES, type PlatformKeyScope } from "@/lib/platform/scopes"
import { resolveOnlinePaymentsEnabled } from "@/lib/stripe/resolve-online-payments-enabled"
import { createSupabaseAdmin, getUserFromApiRequest } from "@/lib/supabase/admin"
import { requireEasnerBusinessId } from "@/lib/terminal/context"

function parseScopes(raw: unknown): PlatformKeyScope[] {
  if (!Array.isArray(raw)) return [...PLATFORM_KEY_SCOPES]
  const requested = raw.filter((s): s is PlatformKeyScope =>
    (PLATFORM_KEY_SCOPES as readonly string[]).includes(String(s)),
  )
  return requested.length > 0 ? requested : [...PLATFORM_KEY_SCOPES]
}

/**
 * Issue a named merchant key pair from Console. Multiple keys can be active
 * per mode at once — creating one never revokes another (use DELETE with a
 * specific `id` for that). The secret is returned once; only the hash is
 * stored.
 */
export async function POST(request: Request) {
  const user = await getUserFromApiRequest(request)
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const ctx = await requireEasnerBusinessId(user.id)
  if (!ctx.ok) return ctx.response

  const body = (await request.json().catch(() => null)) as
    | { mode?: string; name?: string; scopes?: string[] }
    | null
  const mode = parseCheckoutKeyMode(body?.mode ?? "test")
  if (!mode) {
    return NextResponse.json({ error: "Choose test or live keys" }, { status: 400 })
  }
  const name = typeof body?.name === "string" ? body.name.trim().slice(0, 80) || null : null
  const scopes = parseScopes(body?.scopes)

  const admin = createSupabaseAdmin()

  const { enabled: onlinePaymentsEnabled } = await resolveOnlinePaymentsEnabled(admin, ctx.businessId)
  if (!onlinePaymentsEnabled) {
    return NextResponse.json(
      { error: "Turn on online payments in Settings before creating API keys." },
      { status: 409 },
    )
  }

  if (mode === "live") {
    const connect = await resolveConnectReadyForCheckout(admin, ctx.businessId)
    if (!connect.ready) {
      return NextResponse.json(
        { error: connect.reason || "Finish online payment setup before creating live keys." },
        { status: 409 },
      )
    }
  }

  const secretKey = generateSecretKey(mode)
  const publishableKey = generatePublishableKey(mode)

  const { data: inserted, error } = await admin
    .from("business_api_keys")
    .insert({
      business_id: ctx.businessId,
      mode,
      name,
      publishable_key: publishableKey,
      secret_key_hash: hashCheckoutSecretKey(secretKey),
      secret_key_last4: checkoutKeyLast4(secretKey),
      scopes,
      created_by: user.id,
    })
    .select("id, mode, name, publishable_key, secret_key_last4, scopes, created_at")
    .single()

  if (error || !inserted) {
    return NextResponse.json({ error: error?.message || "Could not create keys" }, { status: 400 })
  }

  recordPlatformAudit(admin, {
    businessId: ctx.businessId,
    actorUserId: user.id,
    action: "key.created",
    targetType: "business_api_key",
    targetId: inserted.id as string,
    metadata: { mode, name, scopes },
  })

  return NextResponse.json({ key: inserted, secretKey }, { status: 201 })
}

export async function DELETE(request: Request) {
  const user = await getUserFromApiRequest(request)
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const ctx = await requireEasnerBusinessId(user.id)
  if (!ctx.ok) return ctx.response

  const body = (await request.json().catch(() => null)) as { id?: string; mode?: string } | null
  const admin = createSupabaseAdmin()
  const now = new Date().toISOString()
  let query = admin
    .from("business_api_keys")
    .update({ revoked_at: now, updated_at: now })
    .eq("business_id", ctx.businessId)
    .is("revoked_at", null)

  if (body?.id) {
    query = query.eq("id", body.id)
  } else if (body?.mode === "test" || body?.mode === "live") {
    query = query.eq("mode", body.mode)
  } else {
    return NextResponse.json({ error: "Choose a key to revoke" }, { status: 400 })
  }

  const { data, error } = await query.select("id, mode")
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  for (const row of data ?? []) {
    recordPlatformAudit(admin, {
      businessId: ctx.businessId,
      actorUserId: user.id,
      action: "key.revoked",
      targetType: "business_api_key",
      targetId: row.id as string,
      metadata: { mode: row.mode },
    })
  }

  return NextResponse.json({ ok: true })
}
