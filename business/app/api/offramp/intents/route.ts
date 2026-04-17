import { NextResponse } from "next/server"
import { createSupabaseAdmin } from "@/lib/supabase/admin"
import { requireAuth, requireNoahEnv } from "@/app/api/noah/_helpers"
import { resolveNoahAccountContext } from "@/lib/noah/resolve-account-context"
import { requireNoahVerificationApproved } from "@/lib/noah/noah-tier-guards"
import { createOffRampPaymentIntent } from "@/lib/payment-intents/service"
import type { RecipientSellPrepareRow } from "@/lib/terminal/recipient-sell-prepare"

export const runtime = "nodejs"

export async function POST(request: Request) {
  const mis = requireNoahEnv()
  if (mis) return mis
  const auth = await requireAuth(request)
  if ("error" in auth) return auth.error
  const { user } = auth

  const acc = await resolveNoahAccountContext(request, user.id)
  if (!acc.ok) return acc.response
  const guard = await requireNoahVerificationApproved(
    acc.ctx.subjectUserId,
    acc.ctx.scope,
    acc.ctx.subjectBusinessId,
  )
  if (guard) return guard

  const body = (await request.json().catch(() => null)) as
    | {
        recipientId?: string
        fiatAmount?: number
        cryptoCurrency?: string
        network?: string
        sourceAddress?: string
        quoteId?: string
        idempotencyKey?: string
      }
    | null

  const recipientId = String(body?.recipientId || "").trim()
  const fiatAmount = Number(body?.fiatAmount)
  const cryptoCurrency = String(body?.cryptoCurrency || "").trim()
  const network = String(body?.network || "").trim()

  if (!recipientId || !Number.isFinite(fiatAmount) || fiatAmount <= 0 || !cryptoCurrency || !network) {
    return NextResponse.json(
      { error: "recipientId, fiatAmount, cryptoCurrency, and network are required" },
      { status: 400 },
    )
  }

  const admin = createSupabaseAdmin()
  const { data: recipientRow, error: recErr } = await admin
    .from("recipients")
    .select("*")
    .eq("id", recipientId)
    .eq("user_id", user.id)
    .maybeSingle()

  if (recErr || !recipientRow) {
    return NextResponse.json({ error: "Recipient not found." }, { status: 400 })
  }

  const idempotencyKey =
    request.headers.get("Idempotency-Key")?.trim() || String(body?.idempotencyKey || "").trim() || null

  try {
    const result = await createOffRampPaymentIntent({
      admin,
      ctx: acc.ctx,
      userId: user.id,
      recipientRow: recipientRow as RecipientSellPrepareRow,
      recipientId,
      fiatAmount,
      cryptoCurrency,
      network,
      sourceAddress: body?.sourceAddress ?? null,
      quoteId: body?.quoteId ?? null,
      idempotencyKey,
    })
    return NextResponse.json({
      ok: true,
      intent_id: result.intentId,
      deposit_address: result.destinationAddress,
      form_session_id: result.formSessionId,
      workflow: result.workflowRaw,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 400 })
  }
}
