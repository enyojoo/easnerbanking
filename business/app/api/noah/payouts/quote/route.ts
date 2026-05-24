import { NextResponse } from "next/server"
import { requireAuth, requireNoahEnv } from "../../_helpers"
import { resolveNoahAccountContext } from "@/lib/noah/resolve-account-context"
import { requireNoahVerificationApproved } from "@/lib/noah/noah-tier-guards"
import { buildPayoutQuote } from "@/lib/noah/payout-quote"
import { mapNoahPrepareError } from "@/lib/noah/noah-prepare-errors"
import { payoutCorridorGate } from "@/lib/payout-corridor-validation"
import { validatePayoutAmountAgainstLimits } from "@easner/shared"
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
    note?: string
    paymentPurpose?: string
    email?: string
    branchCode?: string
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
      { requireExecutableNoahChannel: true }, // explicit for quote even if env default changes
    )
    if (gate) return gate

    const isMobile =
      Boolean(gateRow.mobile_provider) ||
      String(gateRow.bank_name || "").toLowerCase().includes("mobile money")
    const rail = isMobile ? ("mobile_money" as const) : ("bank_transfer" as const)
    const limitCheck = validatePayoutAmountAgainstLimits({
      amount: receiveAmount,
      hints: null,
      currencyCode: gateRow.currency,
      rail,
    })
    if (!limitCheck.ok) {
      return NextResponse.json({ error: limitCheck.message }, { status: 400 })
    }
  }

  try {
    const note = typeof body?.note === "string" ? body.note.trim() : undefined
    const paymentPurpose =
      typeof body?.paymentPurpose === "string" ? body.paymentPurpose.trim() : undefined
    const prepareOverrides =
      note || paymentPurpose || body?.email || body?.branchCode
        ? {
            ...(note ? { note } : {}),
            ...(paymentPurpose ? { paymentPurpose } : {}),
            ...(typeof body?.email === "string" && body.email.trim()
              ? { email: body.email.trim() }
              : {}),
            ...(typeof body?.branchCode === "string" && body.branchCode.trim()
              ? { branchCode: body.branchCode.trim() }
              : {}),
          }
        : undefined

    const quote = await buildPayoutQuote({
      userId: user.id,
      noahCustomerId: acc.ctx.noahCustomerId,
      recipientId,
      recipient: inlineRecipient,
      receiveFiatAmount: receiveAmount,
      sourceBalanceCurrency,
      prepareOverrides,
    })
    return NextResponse.json({ ok: true, quote })
  } catch (e) {
    return NextResponse.json({ ok: false, error: mapNoahPrepareError(e) }, { status: 400 })
  }
}
