import { NextResponse } from "next/server"
import { requireAuth, requireNoahEnv } from "../../_helpers"
import { resolveNoahAccountContext } from "@/lib/noah/resolve-account-context"
import { requireNoahVerificationApproved } from "@/lib/noah/noah-tier-guards"
import { buildPayoutQuote } from "@/lib/noah/payout-quote"
import { mapNoahPayoutUserError } from "@/lib/noah/noah-prepare-errors"
import { logNoahPayoutFailure } from "@/lib/noah/log-noah-payout-failure"
import { payoutCorridorGate } from "@/lib/payout-corridor-validation"
import { validatePayoutQuoteAmountLimits } from "@/lib/payout-quote-limit-check"
import {
  normalizePayoutReceiveAmount,
  normalizePayoutReceiveAmountForCurrency,
} from "@easner/shared"
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
    sendAmount?: number | string
    amountEntryMode?: "send" | "receive"
    sourceBalanceCurrency?: string
    note?: string
    paymentPurpose?: string
    email?: string
    branchCode?: string
  } | null

  const amountEntryMode = body?.amountEntryMode === "send" ? "send" : "receive"
  let receiveAmount = normalizePayoutReceiveAmount(Number(body?.receiveAmount))
  const sendAmountInput = Number(body?.sendAmount)
  const sendBudget =
    amountEntryMode === "send" &&
    Number.isFinite(sendAmountInput) &&
    sendAmountInput > 0
      ? sendAmountInput
      : undefined
  const sourceBalanceCurrency = String(body?.sourceBalanceCurrency || "USD").trim().toUpperCase()
  const recipientId = body?.recipientId?.trim()
  const inlineRecipient = body?.recipient

  if (!recipientId && !inlineRecipient) {
    return NextResponse.json({ error: "recipientId or recipient is required." }, { status: 400 })
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

  if (gateRow?.currency) {
    receiveAmount = normalizePayoutReceiveAmountForCurrency(gateRow.currency, receiveAmount)
  }

  if (!Number.isFinite(receiveAmount) || receiveAmount <= 0) {
    return NextResponse.json({ error: "receiveAmount must be positive." }, { status: 400 })
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

    const limitCheck = await validatePayoutQuoteAmountLimits({
      admin,
      gateRow,
      receiveAmount,
      sourceBalanceCurrency,
      amountEntryMode,
      sendBudget,
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
      amountEntryMode,
      sendBudget,
      prepareOverrides,
    })
    return NextResponse.json({ ok: true, quote })
  } catch (e) {
    logNoahPayoutFailure("payouts_quote", e, {
      recipientId,
      receiveAmount,
      sourceBalanceCurrency,
      amountEntryMode,
      sendBudget,
      userId: user.id,
      recipientCountry: gateRow?.country_code ?? null,
      recipientCurrency: gateRow?.currency ?? null,
      recipientBank: gateRow?.bank_name ?? null,
      recipientAccountSuffix: String(gateRow?.account_number ?? "").slice(-4) || null,
    })
    return NextResponse.json(
      { ok: false, error: mapNoahPayoutUserError(e, "quote") },
      { status: 400 },
    )
  }
}
