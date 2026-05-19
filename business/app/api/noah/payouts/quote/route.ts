import { NextResponse } from "next/server"
import { requireAuth, requireNoahEnv } from "../../_helpers"
import { resolveNoahAccountContext } from "@/lib/noah/resolve-account-context"
import { requireNoahVerificationApproved } from "@/lib/noah/noah-tier-guards"
import { buildPayoutQuote } from "@/lib/noah/payout-quote"
import { payoutCorridorGate } from "@/lib/payout-corridor-validation"
import { createSupabaseAdmin } from "@/lib/supabase/admin"
import type { RecipientSellPrepareRow } from "@/lib/terminal/recipient-sell-prepare"

/**
 * Executable payout quote: Noah sell/prepare + Easner pricing in one call.
 */
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

  const body = (await request.json().catch(() => null)) as {
    recipientId?: string
    recipient?: RecipientSellPrepareRow
    receiveAmount?: number | string
    sourceBalanceCurrency?: string
  } | null

  const receiveAmount = Number(body?.receiveAmount)
  const sourceBalanceCurrency = String(body?.sourceBalanceCurrency || "USD").trim().toUpperCase()
  const recipientId = body?.recipientId?.trim()
  const inlineRecipient = body?.recipient

  if (!recipientId && !inlineRecipient) {
    return NextResponse.json({ error: "recipientId or recipient is required." }, { status: 400 })
  }
  if (!Number.isFinite(receiveAmount) || receiveAmount <= 0) {
    return NextResponse.json({ error: "receiveAmount must be positive." }, { status: 400 })
  }

  const admin = createSupabaseAdmin()
  let gateRow: RecipientSellPrepareRow | null = inlineRecipient ?? null
  if (recipientId) {
    const { data } = await admin
      .from("recipients")
      .select("*")
      .eq("id", recipientId)
      .eq("user_id", user.id)
      .maybeSingle()
    if (!data) {
      return NextResponse.json({ error: "Recipient not found." }, { status: 404 })
    }
    gateRow = data as RecipientSellPrepareRow
  }

  if (gateRow) {
    const gate = await payoutCorridorGate(
      admin,
      {
        country_code: gateRow.country_code,
        currency: gateRow.currency,
        bank_name: gateRow.bank_name,
        mobile_provider: gateRow.mobile_provider,
      },
      { requireExecutableNoahChannel: true },
    )
    if (gate) return gate
  }

  try {
    const quote = await buildPayoutQuote({
      userId: user.id,
      noahCustomerId: acc.ctx.noahCustomerId,
      recipientId,
      recipient: inlineRecipient,
      receiveFiatAmount: receiveAmount,
      sourceBalanceCurrency,
    })
    return NextResponse.json({ ok: true, quote })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ ok: false, error: msg }, { status: 400 })
  }
}
