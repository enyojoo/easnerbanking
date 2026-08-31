import { NextResponse } from "next/server"
import { createSupabaseAdmin } from "@/lib/supabase/admin"
import { requireAuth, requireNoahEnv } from "@/app/api/noah/_helpers"
import { resolveNoahAccountContext } from "@/lib/noah/resolve-account-context"
import { requireNoahVerificationApproved } from "@/lib/noah/noah-tier-guards"
import { createOnRampPaymentIntent } from "@/lib/payment-intents/service"

export const runtime = "nodejs"

export async function POST(request: Request) {
  const mis = requireNoahEnv()
  if (mis) return mis
  const auth = await requireAuth(request)
  if ("error" in auth) return auth.error
  const { user } = auth

  const acc = await resolveNoahAccountContext(request, user.id, undefined, "write")
  if (!acc.ok) return acc.response
  const guard = await requireNoahVerificationApproved(
    acc.ctx.subjectUserId,
    acc.ctx.scope,
    acc.ctx.subjectBusinessId,
  )
  if (guard) return guard

  const body = (await request.json().catch(() => null)) as
    | {
        fiatCurrency?: string
        cryptoCurrency?: string
        network?: string
        quoteId?: string
        idempotencyKey?: string
      }
    | null

  const fiatCurrency = String(body?.fiatCurrency || "").trim()
  const cryptoCurrency = String(body?.cryptoCurrency || "").trim()
  const network = String(body?.network || "").trim()
  if (!fiatCurrency || !cryptoCurrency || !network) {
    return NextResponse.json(
      { error: "fiatCurrency, cryptoCurrency, and network are required" },
      { status: 400 },
    )
  }

  const idempotencyKey =
    request.headers.get("Idempotency-Key")?.trim() || String(body?.idempotencyKey || "").trim() || null

  try {
    const admin = createSupabaseAdmin()
    const result = await createOnRampPaymentIntent({
      admin,
      ctx: acc.ctx,
      userId: user.id,
      fiatCurrency,
      cryptoCurrency,
      network,
      quoteId: body?.quoteId ?? null,
      idempotencyKey,
    })
    return NextResponse.json({
      ok: true,
      intent_id: result.intentId,
      destination_address: result.destinationAddress,
      noah: result.noah,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 400 })
  }
}
