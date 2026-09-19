import { NextResponse } from "next/server"
import { createSupabaseAdmin, getUserFromApiRequest } from "@/lib/supabase/admin"
import { requireEasnerBusinessId } from "@/lib/terminal/context"

export async function GET(request: Request) {
  const user = await getUserFromApiRequest(request)
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const ctx = await requireEasnerBusinessId(user.id)
  if (!ctx.ok) return ctx.response

  const admin = createSupabaseAdmin()
  const { data: payouts, error } = await admin
    .from("terminal_payouts")
    .select("id, recipient_id, label, created_at, updated_at")
    .eq("business_id", ctx.businessId)
    .order("created_at", { ascending: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  const list = payouts ?? []
  const recipientIds = [...new Set(list.map((p) => p.recipient_id as string).filter(Boolean))]

  const recMap = new Map<
    string,
    { full_name: string; bank_name: string; currency: string; country_code: string | null }
  >()

  if (recipientIds.length > 0) {
    const { data: recipients, error: rErr } = await admin
      .from("recipients")
      .select("id, full_name, bank_name, currency, country_code")
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
        country_code: row.country_code != null ? String(row.country_code) : null,
      })
    }
  }

  const rows = list.map((row) => {
    const rec = recMap.get(String(row.recipient_id))
    const displayName = rec?.full_name ?? ""
    const bankName = rec?.bank_name ?? ""
    const currency = rec?.currency ?? ""
    const label = row.label != null && String(row.label).trim() ? String(row.label).trim() : null
    const accountName =
      String(displayName).trim() || label || [bankName].filter(Boolean).join(" · ") || "Payout method"
    const detailLine = [currency, bankName].filter((x) => String(x).trim()).join(" · ")
    return {
      id: row.id,
      recipient_id: row.recipient_id,
      label,
      account_name: accountName,
      detail_line: detailLine,
      // Back-compat for older clients; prefer account_name + detail_line in UI.
      display_label: label || [displayName, bankName].filter(Boolean).join(" · ") || accountName,
      currency,
      created_at: row.created_at,
      updated_at: row.updated_at,
    }
  })

  return NextResponse.json({ payouts: rows })
}

export async function POST(request: Request) {
  const user = await getUserFromApiRequest(request)
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const ctx = await requireEasnerBusinessId(user.id)
  if (!ctx.ok) return ctx.response

  const body = (await request.json().catch(() => null)) as {
    recipient_id?: string
    label?: string | null
  } | null

  const recipientId = String(body?.recipient_id || "").trim()
  if (!recipientId) {
    return NextResponse.json({ error: "recipient_id is required." }, { status: 400 })
  }

  const admin = createSupabaseAdmin()

  const { data: rec, error: recErr } = await admin
    .from("recipients")
    .select("id")
    .eq("id", recipientId)
    .eq("user_id", user.id)
    .maybeSingle()

  if (recErr || !rec) {
    return NextResponse.json(
      { error: "Recipient not found or does not belong to your account." },
      { status: 400 },
    )
  }

  const label =
    body?.label != null && String(body.label).trim() ? String(body.label).trim().slice(0, 200) : null

  const { data: existing } = await admin
    .from("terminal_payouts")
    .select("id")
    .eq("business_id", ctx.businessId)
    .eq("recipient_id", recipientId)
    .maybeSingle()

  if (existing?.id) {
    if (label != null) {
      await admin
        .from("terminal_payouts")
        .update({ label, updated_at: new Date().toISOString() })
        .eq("id", existing.id)
    }
    return NextResponse.json(
      { payout: { id: existing.id, recipient_id: recipientId, label } },
      { status: 200 },
    )
  }

  const { data: inserted, error: insErr } = await admin
    .from("terminal_payouts")
    .insert({
      business_id: ctx.businessId,
      created_by: user.id,
      recipient_id: recipientId,
      label,
    })
    .select("id, recipient_id, label")
    .single()

  if (insErr) {
    return NextResponse.json({ error: insErr.message }, { status: 400 })
  }

  return NextResponse.json({ payout: inserted }, { status: 201 })
}

export async function DELETE(request: Request) {
  const user = await getUserFromApiRequest(request)
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const ctx = await requireEasnerBusinessId(user.id)
  if (!ctx.ok) return ctx.response

  const id = new URL(request.url).searchParams.get("id")?.trim()
  if (!id) {
    return NextResponse.json({ error: "Query parameter id is required." }, { status: 400 })
  }

  const admin = createSupabaseAdmin()
  const { error } = await admin
    .from("terminal_payouts")
    .delete()
    .eq("id", id)
    .eq("business_id", ctx.businessId)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  return NextResponse.json({ ok: true })
}
