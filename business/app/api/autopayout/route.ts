import { NextResponse } from "next/server"
import { createSupabaseAdmin, getUserFromApiRequest } from "@/lib/supabase/admin"
import { requireAuth } from "@/app/api/noah/_helpers"
import { requireEasnerBusinessId } from "@/lib/terminal/context"
import { createAutopayoutConfig } from "@/lib/autopayout/create-autopayout-config"

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
  const auth = await requireAuth(request)
  if ("error" in auth) return auth.error

  const body = (await request.json().catch(() => null)) as {
    recipient_id?: string
    payer_wallet_id?: string
    label?: string | null
    crypto_currency?: string
    network?: string
    source_address?: string
    fiat_prepare_amount?: number | string
  } | null

  const created = await createAutopayoutConfig(request, auth.user, {
    recipientId: body?.recipient_id,
    payerWalletId: body?.payer_wallet_id,
    label: body?.label,
    cryptoCurrency: body?.crypto_currency,
    network: body?.network,
    sourceAddress: body?.source_address,
    fiatPrepareAmount: body?.fiat_prepare_amount,
  })
  if (!created.ok) return created.response

  return NextResponse.json({ autopayout: created.config }, { status: 201 })
}
