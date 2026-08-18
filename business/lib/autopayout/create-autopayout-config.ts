import { NextResponse } from "next/server"
import { requireNoahEnv } from "@/app/api/noah/_helpers"
import { resolveNoahAccountContext } from "@/lib/noah/resolve-account-context"
import { requireNoahVerificationApproved } from "@/lib/noah/noah-tier-guards"
import { requireEasnerBusinessId } from "@/lib/terminal/context"
import { resolveTerminalPayFiatCurrency } from "@/lib/noah/terminal-pay-fiat"
import { isAllowedTerminalPair } from "@/lib/terminal-allowed-pairs"
import { provisionAutopayoutDepositAddress } from "@/lib/autopayout/provision-deposit"
import type { RecipientSellPrepareRow } from "@/lib/terminal/recipient-sell-prepare"
import { createSupabaseAdmin } from "@/lib/supabase/admin"

const CONFIG_COLUMNS =
  "id, recipient_id, label, crypto_currency, network, deposit_address, deposit_memo, status, fiat_prepare_amount, prepare_fiat_currency, expires_at, created_at, updated_at"

export type CreateAutopayoutConfigInput = {
  recipientId?: string | null
  /** Preferred: reuse a saved payer wallet's asset/network/source address. */
  payerWalletId?: string | null
  label?: string | null
  cryptoCurrency?: string | null
  network?: string | null
  sourceAddress?: string | null
  fiatPrepareAmount?: number | string | null
}

export type CreateAutopayoutConfigResult =
  | { ok: true; businessId: string; config: Record<string, unknown> }
  | { ok: false; response: NextResponse }

/**
 * Provision a standing stablecoin deposit address (placard) that auto-pays out to a
 * saved payout account. Shared by the placard API and the Payment Links create flow.
 */
export async function createAutopayoutConfig(
  request: Request,
  user: { id: string },
  input: CreateAutopayoutConfigInput,
): Promise<CreateAutopayoutConfigResult> {
  const mis = requireNoahEnv()
  if (mis) return { ok: false, response: mis }

  const acc = await resolveNoahAccountContext(request, user.id)
  if (!acc.ok) return { ok: false, response: acc.response }
  const guard = await requireNoahVerificationApproved(
    acc.ctx.subjectUserId,
    acc.ctx.scope,
    acc.ctx.subjectBusinessId,
  )
  if (guard) return { ok: false, response: guard }

  const biz = await requireEasnerBusinessId(user.id)
  if (!biz.ok) return { ok: false, response: biz.response }
  if (acc.ctx.subjectBusinessId && acc.ctx.subjectBusinessId !== biz.businessId) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Business scope mismatch." }, { status: 400 }),
    }
  }

  const recipientId = String(input.recipientId || "").trim()
  if (!recipientId) {
    return {
      ok: false,
      response: NextResponse.json({ error: "recipient_id is required." }, { status: 400 }),
    }
  }

  const admin = createSupabaseAdmin()
  const payerWalletId = String(input.payerWalletId || "").trim()

  let cryptoCurrency: string
  let network: string
  let label: string | null
  let sourceAddress: string

  if (payerWalletId) {
    const { data: pw, error: pwErr } = await admin
      .from("autopayout_payer_wallets")
      .select("source_address, crypto_currency, network, label")
      .eq("id", payerWalletId)
      .eq("business_id", biz.businessId)
      .is("archived_at", null)
      .maybeSingle()

    if (pwErr || !pw) {
      return {
        ok: false,
        response: NextResponse.json(
          { error: "Payer wallet not found or archived." },
          { status: 400 },
        ),
      }
    }
    const row = pw as Record<string, unknown>
    cryptoCurrency = String(row.crypto_currency || "").trim()
    network = String(row.network || "").trim()
    sourceAddress = String(row.source_address || "").trim()
    label =
      input.label != null && String(input.label).trim()
        ? String(input.label).trim().slice(0, 200)
        : row.label != null && String(row.label).trim()
          ? String(row.label).trim().slice(0, 200)
          : null
  } else {
    cryptoCurrency = String(input.cryptoCurrency || "").trim()
    network = String(input.network || "").trim()
    label =
      input.label != null && String(input.label).trim()
        ? String(input.label).trim().slice(0, 200)
        : null
    sourceAddress =
      String(input.sourceAddress || "").trim() ||
      (process.env.NOAH_TERMINAL_SOURCE_ADDRESS || "").trim()
  }

  if (!isAllowedTerminalPair(cryptoCurrency, network)) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Unsupported crypto/network pair." }, { status: 400 }),
    }
  }

  if (!sourceAddress) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          error:
            "source_address is required for automated payout (payer wallet), or set NOAH_TERMINAL_SOURCE_ADDRESS, or provision a Turnkey Solana wallet for this asset.",
        },
        { status: 400 },
      ),
    }
  }

  let fiatPrepareAmount = Number(input.fiatPrepareAmount ?? 1)
  if (!Number.isFinite(fiatPrepareAmount) || fiatPrepareAmount <= 0) {
    fiatPrepareAmount = 1
  }

  const { data: businessRow } = await admin
    .from("businesses")
    .select("base_currency")
    .eq("id", biz.businessId)
    .maybeSingle()
  const fiatCurrency = resolveTerminalPayFiatCurrency(businessRow?.base_currency as string | null)

  const { data: recipientRow, error: recErr } = await admin
    .from("recipients")
    .select("*")
    .eq("id", recipientId)
    .eq("user_id", user.id)
    .maybeSingle()

  if (recErr || !recipientRow) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Recipient not found." }, { status: 400 }),
    }
  }

  const { data: terminalPayout, error: tpErr } = await admin
    .from("terminal_payouts")
    .select("id")
    .eq("business_id", biz.businessId)
    .eq("recipient_id", recipientId)
    .maybeSingle()

  if (tpErr) {
    return { ok: false, response: NextResponse.json({ error: tpErr.message }, { status: 400 }) }
  }
  if (!terminalPayout) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          error:
            "This payout account must be linked in Payout setup (terminal payouts) before creating a placard. Choose it from the list or add it there first.",
        },
        { status: 400 },
      ),
    }
  }

  const { data: inserted, error: insErr } = await admin
    .from("autopayout_configs")
    .insert({
      business_id: biz.businessId,
      created_by: user.id,
      recipient_id: recipientId,
      label,
      crypto_currency: cryptoCurrency,
      network,
      status: "provisioning",
      fiat_prepare_amount: fiatPrepareAmount,
      prepare_fiat_currency: fiatCurrency,
    })
    .select(CONFIG_COLUMNS)
    .single()

  if (insErr || !inserted?.id) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: insErr?.message || "Failed to create autopayout." },
        { status: 400 },
      ),
    }
  }

  const autopayoutId = inserted.id as string

  try {
    await provisionAutopayoutDepositAddress({
      admin,
      autopayoutId,
      businessId: biz.businessId,
      recipientRow: recipientRow as unknown as RecipientSellPrepareRow,
      cryptoCurrency,
      network,
      fiatPrepareAmount,
      prepareFiatCurrency: fiatCurrency,
      noahCustomerId: acc.ctx.noahCustomerId,
      sourceAddress,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return {
      ok: false,
      response: NextResponse.json({ error: msg, autopayout_id: autopayoutId }, { status: 502 }),
    }
  }

  const { data: refreshed } = await admin
    .from("autopayout_configs")
    .select(CONFIG_COLUMNS)
    .eq("id", autopayoutId)
    .single()

  return {
    ok: true,
    businessId: biz.businessId,
    config: (refreshed ?? inserted) as Record<string, unknown>,
  }
}
