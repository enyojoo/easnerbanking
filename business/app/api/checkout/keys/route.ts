import { NextResponse } from "next/server"
import {
  checkoutKeyLast4,
  generatePublishableKey,
  generateSecretKey,
  hashCheckoutSecretKey,
  parseCheckoutKeyMode,
} from "@/lib/checkout/secrets"
import { resolveConnectReadyForCheckout } from "@/lib/stripe/connect"
import { resolveOnlinePaymentsEnabled } from "@/lib/stripe/resolve-online-payments-enabled"
import { createSupabaseAdmin, getUserFromApiRequest } from "@/lib/supabase/admin"
import { requireEasnerBusinessId } from "@/lib/terminal/context"

/**
 * Issue (or rotate) checkout-scoped merchant keys. The secret is returned once and
 * only its hash is stored, so a leaked key can never be read back or reused elsewhere.
 */
export async function POST(request: Request) {
  const user = await getUserFromApiRequest(request)
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const ctx = await requireEasnerBusinessId(user.id)
  if (!ctx.ok) return ctx.response

  const body = (await request.json().catch(() => null)) as { mode?: string } | null
  const mode = parseCheckoutKeyMode(body?.mode ?? "test")
  if (!mode) {
    return NextResponse.json({ error: "Choose test or live keys" }, { status: 400 })
  }

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
  const now = new Date().toISOString()

  await admin
    .from("business_api_keys")
    .update({ revoked_at: now, updated_at: now })
    .eq("business_id", ctx.businessId)
    .eq("mode", mode)
    .is("revoked_at", null)

  const { data: inserted, error } = await admin
    .from("business_api_keys")
    .insert({
      business_id: ctx.businessId,
      mode,
      publishable_key: publishableKey,
      secret_key_hash: hashCheckoutSecretKey(secretKey),
      secret_key_last4: checkoutKeyLast4(secretKey),
      scopes: ["checkout"],
      created_by: user.id,
    })
    .select("id, mode, publishable_key, secret_key_last4, created_at")
    .single()

  if (error || !inserted) {
    return NextResponse.json({ error: error?.message || "Could not create keys" }, { status: 400 })
  }

  return NextResponse.json({ key: inserted, secretKey }, { status: 201 })
}
