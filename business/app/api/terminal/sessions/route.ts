import { NextResponse } from "next/server"
import { createSupabaseAdmin, getUserFromApiRequest } from "@/lib/supabase/admin"
import { requireNoahEnv, requireAuth } from "@/app/api/noah/_helpers"
import { resolveNoahAccountContext } from "@/lib/noah/resolve-account-context"
import { requireNoahVerificationApproved } from "@/lib/noah/noah-tier-guards"
import { requireEasnerBusinessId } from "@/lib/terminal/context"
import { resolveTerminalPayFiatCurrency } from "@/lib/noah/terminal-pay-fiat"
import { isAllowedTerminalPair } from "@/lib/terminal-allowed-pairs"
import { prepareSellFromRecipientRow } from "@/lib/terminal/recipient-sell-prepare"
import {
  pickDestinationAddress,
  pickTriggerCryptoAmount,
  startOnchainDepositToPaymentWorkflow,
} from "@/lib/terminal/automated-payout-workflow"

export async function GET(request: Request) {
  const user = await getUserFromApiRequest(request)
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const ctx = await requireEasnerBusinessId(user.id)
  if (!ctx.ok) return ctx.response

  const admin = createSupabaseAdmin()
  const { data, error } = await admin
    .from("terminal_sessions")
    .select(
      "id, status, fiat_amount, fiat_currency, crypto_currency, network, destination_address, created_at, recipient_id, source_address, external_id, expires_at",
    )
    .eq("business_id", ctx.businessId)
    .order("created_at", { ascending: false })
    .limit(200)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  return NextResponse.json({ sessions: data ?? [] })
}

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

  const biz = await requireEasnerBusinessId(user.id)
  if (!biz.ok) return biz.response
  if (acc.ctx.subjectBusinessId && acc.ctx.subjectBusinessId !== biz.businessId) {
    return NextResponse.json({ error: "Business scope mismatch." }, { status: 400 })
  }

  const body = (await request.json().catch(() => null)) as {
    fiat_amount?: string | number
    crypto_currency?: string
    network?: string
    /** Resolve via `terminal_payouts` (preferred). */
    terminal_payout_id?: string
    /** Rare override; must belong to the authenticated user. */
    recipient_id?: string
    source_address?: string
  } | null

  const fiatAmount = Number.parseFloat(String(body?.fiat_amount ?? ""))
  const cryptoCurrency = String(body?.crypto_currency ?? "").trim()
  const network = String(body?.network ?? "").trim()

  if (!Number.isFinite(fiatAmount) || fiatAmount <= 0) {
    return NextResponse.json({ error: "fiat_amount must be a positive number." }, { status: 400 })
  }

  const pair = isAllowedTerminalPair(cryptoCurrency, network)
  if (!pair) {
    return NextResponse.json({ error: "Unsupported crypto/network pair for terminal." }, { status: 400 })
  }

  const admin = createSupabaseAdmin()

  const { data: businessRow } = await admin
    .from("businesses")
    .select("base_currency")
    .eq("id", biz.businessId)
    .maybeSingle()
  /** Counter charge denomination only (`/pay` UI / session row). Bank payout currency = recipient from terminal setup. */
  const fiatCurrency = resolveTerminalPayFiatCurrency(businessRow?.base_currency as string | null)

  let recipientId = String(body?.recipient_id || "").trim() || null
  const terminalPayoutIdBody = String(body?.terminal_payout_id || "").trim() || null

  const resolveRecipientFromPayoutId = async (payoutId: string): Promise<string | null> => {
    const { data: row } = await admin
      .from("terminal_payouts")
      .select("recipient_id")
      .eq("id", payoutId)
      .eq("business_id", biz.businessId)
      .maybeSingle()
    return (row?.recipient_id as string | null) ?? null
  }

  if (!recipientId && terminalPayoutIdBody) {
    recipientId = await resolveRecipientFromPayoutId(terminalPayoutIdBody)
  }

  if (!recipientId) {
    const { data: settingsRow } = await admin
      .from("terminal_settings")
      .select("default_terminal_payout_id")
      .eq("business_id", biz.businessId)
      .maybeSingle()
    const defPid = (settingsRow?.default_terminal_payout_id as string | null) ?? null
    if (defPid) {
      recipientId = await resolveRecipientFromPayoutId(defPid)
    }
  }

  if (!recipientId) {
    return NextResponse.json(
      { error: "Choose a default payout method on Stablecoin Terminal (Setup payout) first." },
      { status: 400 },
    )
  }

  const { data: recipientRow, error: recErr } = await admin
    .from("recipients")
    .select("*")
    .eq("id", recipientId)
    .eq("user_id", user.id)
    .maybeSingle()

  if (recErr || !recipientRow) {
    return NextResponse.json({ error: "Recipient not found." }, { status: 400 })
  }

  const sourceAddress =
    String(body?.source_address || "").trim() ||
    (process.env.NOAH_TERMINAL_SOURCE_ADDRESS || "").trim()

  if (!sourceAddress) {
    return NextResponse.json(
      {
        error:
          "source_address is required for automated payout (payer wallet), or set NOAH_TERMINAL_SOURCE_ADDRESS for sandbox.",
      },
      { status: 400 },
    )
  }

  let prep: Awaited<ReturnType<typeof prepareSellFromRecipientRow>>
  try {
    prep = await prepareSellFromRecipientRow({
      row: recipientRow,
      fiatAmount,
      cryptoCurrency,
      noahCustomerId: acc.ctx.noahCustomerId,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 400 })
  }

  const formSessionId = prep.prep.formSessionId?.trim()
  if (!formSessionId) {
    return NextResponse.json(
      { error: "Could not start payout session. Try again or contact support if this continues." },
      { status: 502 },
    )
  }

  const { data: inserted, error: insErr } = await admin
    .from("terminal_sessions")
    .insert({
      business_id: biz.businessId,
      created_by: user.id,
      recipient_id: recipientId,
      crypto_currency: cryptoCurrency,
      network,
      fiat_amount: fiatAmount,
      fiat_currency: fiatCurrency,
      crypto_amount_expected: prep.prep.cryptoAuthorizedAmount || prep.prep.cryptoAmountEstimate || null,
      status: "creating_workflow",
      noah_form_session_id: formSessionId,
      source_address: sourceAddress,
    })
    .select("id")
    .single()

  if (insErr || !inserted?.id) {
    return NextResponse.json({ error: insErr?.message || "Failed to create session." }, { status: 400 })
  }

  const sessionId = inserted.id as string

  const cryptoTrigger = pickTriggerCryptoAmount(
    prep.prep.cryptoAuthorizedAmount || "",
    prep.prep.cryptoAmountEstimate || "",
  )

  let workflowRaw: Record<string, unknown>
  try {
    workflowRaw = await startOnchainDepositToPaymentWorkflow({
      customerId: acc.ctx.noahCustomerId,
      cryptoCurrency,
      fiatAmount: fiatAmount.toFixed(2),
      formSessionId,
      externalId: sessionId,
      network,
      sourceAddress,
      cryptoTriggerAmount: cryptoTrigger,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    await admin
      .from("terminal_sessions")
      .update({ status: "failed", updated_at: new Date().toISOString() })
      .eq("id", sessionId)
    return NextResponse.json({ error: msg, session_id: sessionId }, { status: 502 })
  }

  const destination = pickDestinationAddress(workflowRaw)
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString()

  await admin
    .from("terminal_sessions")
    .update({
      status: "awaiting_deposit",
      destination_address: destination,
      external_id: sessionId,
      noah_workflow_raw: workflowRaw as object,
      expires_at: expiresAt,
      noah_trigger_json: workflowRaw.Trigger ?? workflowRaw.trigger ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", sessionId)

  return NextResponse.json({
    session_id: sessionId,
    destination_address: destination,
    expires_at: expiresAt,
    crypto_currency: cryptoCurrency,
    network,
    fiat_amount: fiatAmount,
    fiat_currency: fiatCurrency,
  })
}
