import { NextResponse } from "next/server"
import { createSupabaseAdmin, getUserFromApiRequest } from "@/lib/supabase/admin"
import { requireNoahEnv, requireAuth } from "@/app/api/noah/_helpers"
import { resolveNoahAccountContext } from "@/lib/noah/resolve-account-context"
import { requireNoahVerificationApproved } from "@/lib/noah/noah-tier-guards"
import { requireEasnerBusinessId } from "@/lib/terminal/context"
import { resolveTerminalPayFiatCurrency } from "@/lib/noah/terminal-pay-fiat"
import { isAllowedTerminalPair } from "@/lib/terminal-allowed-pairs"
import { provisionAutopayoutDepositAddress } from "@/lib/autopayout/provision-deposit"
import type { RecipientSellPrepareRow } from "@/lib/terminal/recipient-sell-prepare"

export async function GET(request: Request) {
  const user = await getUserFromApiRequest(request)
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const ctx = await requireEasnerBusinessId(user.id)
  if (!ctx.ok) return ctx.response

  const admin = createSupabaseAdmin()
  const { data: rows, error } = await admin
    .from("autopayout_configs")
    .select(
      "id, recipient_id, label, crypto_currency, network, deposit_address, deposit_memo, status, fiat_prepare_amount, prepare_fiat_currency, expires_at, archived_at, placard_hd_png_storage_path, placard_pdf_storage_path, placard_generated_at, placard_template_version, placard_content_hash, created_at, updated_at",
    )
    .eq("business_id", ctx.businessId)
    .is("archived_at", null)
    .order("created_at", { ascending: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  const list = rows ?? []
  const recipientIds = [...new Set(list.map((r) => String(r.recipient_id)).filter(Boolean))]

  const recMap = new Map<string, { full_name: string; bank_name: string; currency: string }>()
  if (recipientIds.length > 0) {
    const { data: recipients, error: rErr } = await admin
      .from("recipients")
      .select("id, full_name, bank_name, currency")
      .in("id", recipientIds)
      .eq("user_id", user.id)

    if (rErr) {
      return NextResponse.json({ error: rErr.message }, { status: 400 })
    }
    for (const r of recipients ?? []) {
      const row = r as Record<string, unknown>
      recMap.set(String(row.id), {
        full_name: String(row.full_name ?? ""),
        bank_name: String(row.bank_name ?? ""),
        currency: String(row.currency ?? ""),
      })
    }
  }

  const autopayouts = list.map((r) => {
    const rec = recMap.get(String(r.recipient_id))
    return {
      ...r,
      recipient_summary: rec
        ? {
            full_name: rec.full_name,
            bank_name: rec.bank_name,
            currency: rec.currency,
          }
        : null,
    }
  })

  return NextResponse.json({ autopayouts })
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
    recipient_id?: string
    payer_wallet_id?: string
    label?: string | null
    crypto_currency?: string
    network?: string
    source_address?: string
    fiat_prepare_amount?: number | string
  } | null

  const recipientId = String(body?.recipient_id || "").trim()
  if (!recipientId) {
    return NextResponse.json({ error: "recipient_id is required." }, { status: 400 })
  }

  const admin = createSupabaseAdmin()

  const payerWalletId = String(body?.payer_wallet_id || "").trim()
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
      return NextResponse.json({ error: "Payer wallet not found or archived." }, { status: 400 })
    }
    const row = pw as Record<string, unknown>
    cryptoCurrency = String(row.crypto_currency || "").trim()
    network = String(row.network || "").trim()
    sourceAddress = String(row.source_address || "").trim()
    label =
      row.label != null && String(row.label).trim() ? String(row.label).trim().slice(0, 200) : null
  } else {
    cryptoCurrency = String(body?.crypto_currency || "").trim()
    network = String(body?.network || "").trim()
    label =
      body?.label != null && String(body.label).trim() ? String(body.label).trim().slice(0, 200) : null
    sourceAddress =
      String(body?.source_address || "").trim() ||
      (process.env.NOAH_TERMINAL_SOURCE_ADDRESS || "").trim()
  }

  const pair = isAllowedTerminalPair(cryptoCurrency, network)
  if (!pair) {
    return NextResponse.json({ error: "Unsupported crypto/network pair." }, { status: 400 })
  }

  if (!sourceAddress) {
    return NextResponse.json(
      {
        error:
          "source_address is required for automated payout, or set NOAH_TERMINAL_SOURCE_ADDRESS for sandbox.",
      },
      { status: 400 },
    )
  }

  let fiatPrepareAmount = Number(body?.fiat_prepare_amount ?? 1)
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
    return NextResponse.json({ error: "Recipient not found." }, { status: 400 })
  }

  const { data: terminalPayout, error: tpErr } = await admin
    .from("terminal_payouts")
    .select("id")
    .eq("business_id", biz.businessId)
    .eq("recipient_id", recipientId)
    .maybeSingle()

  if (tpErr) {
    return NextResponse.json({ error: tpErr.message }, { status: 400 })
  }
  if (!terminalPayout) {
    return NextResponse.json(
      {
        error:
          "This payout account must be linked in Payout setup (terminal payouts) before creating a placard. Choose it from the list or add it there first.",
      },
      { status: 400 },
    )
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
    .select(
      "id, recipient_id, label, crypto_currency, network, deposit_address, deposit_memo, status, fiat_prepare_amount, prepare_fiat_currency, expires_at, created_at, updated_at",
    )
    .single()

  if (insErr || !inserted?.id) {
    return NextResponse.json({ error: insErr?.message || "Failed to create autopayout." }, { status: 400 })
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
    return NextResponse.json({ error: msg, autopayout_id: autopayoutId }, { status: 502 })
  }

  const { data: refreshed } = await admin
    .from("autopayout_configs")
    .select(
      "id, recipient_id, label, crypto_currency, network, deposit_address, deposit_memo, status, fiat_prepare_amount, prepare_fiat_currency, expires_at, created_at, updated_at",
    )
    .eq("id", autopayoutId)
    .single()

  return NextResponse.json({ autopayout: refreshed ?? inserted }, { status: 201 })
}
