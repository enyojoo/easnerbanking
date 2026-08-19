import { NextResponse } from "next/server"
import { requireAuth, resolveNoahContextAsync } from "@/app/api/noah/_helpers"
import { resolveNoahAccountContext } from "@/lib/noah/resolve-account-context"
import { requireNoahVerificationApproved } from "@/lib/noah/noah-tier-guards"
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
import { sendDestinationFromRow } from "@/lib/send-destination"
import { lockSendDestination } from "@/lib/send-destination-operations"
import { resolveBusinessOrgOwnerUserId } from "@/lib/business/org-owner"
import { selectProviderForCorridor, NoProviderForCorridorError } from "@/lib/payout-providers"
import { requirePayoutProviderEnv } from "@/lib/payout-providers/require-provider-env"
import type { PayoutEnvProviderId } from "@/lib/payout-providers/require-provider-env"
import { asYcPayoutError } from "@/lib/yellowcard/payout-errors"

/** Lock balance payout order after user reaches review (Noah + YC + Grid). */
export async function POST(request: Request) {
  const auth = await requireAuth(request)
  if ("error" in auth) return auth.error
  const { user } = auth

  const [noahCtxResult, acc] = await Promise.all([
    resolveNoahContextAsync(user.id, request),
    resolveNoahAccountContext(request, user.id),
  ])
  if (!noahCtxResult.ok) return noahCtxResult.response
  if (!acc.ok) return acc.response
  const guard = await requireNoahVerificationApproved(
    acc.ctx.subjectUserId,
    acc.ctx.scope,
    acc.ctx.subjectBusinessId,
  )
  if (guard) return guard

  const body = (await request.json().catch(() => null)) as {
    recipientId?: string
    receiveAmount?: number | string
    sendAmount?: number | string
    amountEntryMode?: "send" | "receive"
    sourceBalanceCurrency?: string
    note?: string
    paymentPurpose?: string
  } | null

  const amountEntryMode = body?.amountEntryMode === "send" ? "send" : "receive"
  let receiveAmount = normalizePayoutReceiveAmount(Number(body?.receiveAmount))
  const sendAmountRaw = Number(body?.sendAmount)
  const sourceBalanceCurrency = String(body?.sourceBalanceCurrency || "USD")
    .trim()
    .toUpperCase()
  const recipientId = String(body?.recipientId || "").trim()

  if (!recipientId || !(receiveAmount > 0)) {
    return NextResponse.json(
      { ok: false, error: "recipientId and receiveAmount are required." },
      { status: 400 },
    )
  }

  const admin = createSupabaseAdmin()
  const { data: rec } = await admin
    .from("recipients")
    .select("*")
    .eq("id", recipientId)
    .eq("user_id", user.id)
    .maybeSingle()
  if (!rec) {
    return NextResponse.json({ ok: false, error: "Recipient not found." }, { status: 404 })
  }

  const recipientRow = rec as RecipientSellPrepareRow
  receiveAmount = normalizePayoutReceiveAmountForCurrency(
    String(recipientRow.currency || ""),
    receiveAmount,
  )

  const gate = await payoutCorridorGate(
    admin,
    {
      country_code: String(rec.country_code || "").toUpperCase(),
      currency: String(rec.currency || "").toUpperCase(),
      bank_name: rec.bank_name,
      mobile_provider: rec.mobile_provider,
      wallet_network: rec.wallet_network,
    },
    { requireExecutableProviderChannel: true },
  )
  if (gate) return gate

  try {
    const provider = await selectProviderForCorridor(admin, {
      countryCode: String(rec.country_code || "").toUpperCase(),
      currencyCode: String(rec.currency || "").toUpperCase(),
      rail:
        rec.mobile_provider || String(rec.bank_name || "").toLowerCase().includes("mobile money")
          ? "mobile_money"
          : "bank_transfer",
      mobileProvider: rec.mobile_provider,
      bankName: rec.bank_name,
      businessId: noahCtxResult.scope === "business" ? noahCtxResult.businessId : null,
      userId: user.id,
    })
    const envProvider: PayoutEnvProviderId =
      provider.id === "yellowcard" || provider.id === "grid" ? provider.id : "noah"
    const envGate = requirePayoutProviderEnv(envProvider)
    if (envGate) return envGate
  } catch (e) {
    if (e instanceof NoProviderForCorridorError) {
      return NextResponse.json(
        { ok: false, error: e.message, code: "PAYOUT_PROVIDER_UNAVAILABLE" },
        { status: 400 },
      )
    }
    throw e
  }

  const limitCheck = await validatePayoutQuoteAmountLimits({
    admin,
    gateRow: recipientRow,
    receiveAmount,
    sourceBalanceCurrency,
    amountEntryMode,
    sendBudget: amountEntryMode === "send" && sendAmountRaw > 0 ? sendAmountRaw : undefined,
  })
  if (!limitCheck.ok) {
    return NextResponse.json({ ok: false, error: limitCheck.message }, { status: 400 })
  }

  try {
    const businessId = noahCtxResult.scope === "business" ? noahCtxResult.businessId : null
    const operationUserId =
      (businessId
        ? await resolveBusinessOrgOwnerUserId(admin, businessId).catch(() => null)
        : null) ?? user.id
    const locked = await lockSendDestination(
      {
        admin,
        accountContext: acc.ctx,
        userId: operationUserId,
        businessId,
        sourceCurrency: sourceBalanceCurrency,
        noahCustomerId: noahCtxResult.noahCustomerId,
      },
      {
        destination: sendDestinationFromRow({ ...recipientRow, id: recipientId }, "recipient"),
        amount: receiveAmount,
        amountEntryMode,
        sendAmount: sendAmountRaw > 0 ? sendAmountRaw : undefined,
        note: typeof body?.note === "string" ? body.note.trim() : undefined,
        purpose: typeof body?.paymentPurpose === "string" ? body.paymentPurpose.trim() : undefined,
        idempotencyKey: `send_lock:${operationUserId}:${recipientId}:${Date.now()}`,
      },
    )
    return NextResponse.json({ ok: true, quote: locked.rawQuote })
  } catch (e) {
    const ycError = asYcPayoutError(e)
    if (ycError) {
      return NextResponse.json(
        { ok: false, error: ycError.message, code: ycError.code },
        { status: ycError.status },
      )
    }
    logNoahPayoutFailure("payout_confirm", e, { recipientId, receiveAmount })
    const msg = e instanceof Error ? e.message : "Payout confirm failed"
    return NextResponse.json({ ok: false, error: mapNoahPayoutUserError(msg) }, { status: 400 })
  }
}
