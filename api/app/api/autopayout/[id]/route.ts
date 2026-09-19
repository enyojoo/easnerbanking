import { NextResponse } from "next/server"
import { createSupabaseAdmin, getUserFromApiRequest } from "@/lib/supabase/admin"
import { requireEasnerBusinessId } from "@/lib/terminal/context"

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const user = await getUserFromApiRequest(request)
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const ctx = await requireEasnerBusinessId(user.id)
  if (!ctx.ok) return ctx.response

  const { id } = await context.params
  const autopayoutId = String(id || "").trim()
  if (!autopayoutId) {
    return NextResponse.json({ error: "Invalid id." }, { status: 400 })
  }

  const admin = createSupabaseAdmin()
  const { data: row, error } = await admin
    .from("autopayout_configs")
    .select(
      "id, recipient_id, label, crypto_currency, network, deposit_address, deposit_memo, status, fiat_prepare_amount, prepare_fiat_currency, expires_at, archived_at, placard_hd_png_storage_path, placard_pdf_storage_path, placard_generated_at, placard_template_version, placard_content_hash, created_at, updated_at",
    )
    .eq("id", autopayoutId)
    .eq("business_id", ctx.businessId)
    .maybeSingle()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }
  if (!row) {
    return NextResponse.json({ error: "Not found." }, { status: 404 })
  }

  const { data: rec } = await admin
    .from("recipients")
    .select("id, full_name, bank_name, currency")
    .eq("id", row.recipient_id as string)
    .eq("user_id", user.id)
    .maybeSingle()

  return NextResponse.json({
    autopayout: {
      ...row,
      recipient_summary: rec
        ? {
            full_name: rec.full_name,
            bank_name: rec.bank_name,
            currency: rec.currency,
          }
        : null,
    },
  })
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const user = await getUserFromApiRequest(request)
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const ctx = await requireEasnerBusinessId(user.id)
  if (!ctx.ok) return ctx.response

  const { id } = await context.params
  const autopayoutId = String(id || "").trim()
  if (!autopayoutId) {
    return NextResponse.json({ error: "Invalid id." }, { status: 400 })
  }

  const body = (await request.json().catch(() => null)) as {
    label?: string | null
    archived?: boolean
  } | null

  const admin = createSupabaseAdmin()

  const { data: existing, error: exErr } = await admin
    .from("autopayout_configs")
    .select("id, archived_at")
    .eq("id", autopayoutId)
    .eq("business_id", ctx.businessId)
    .maybeSingle()

  if (exErr) {
    return NextResponse.json({ error: exErr.message }, { status: 400 })
  }
  if (!existing) {
    return NextResponse.json({ error: "Not found." }, { status: 404 })
  }

  const patch: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  }

  if (body && "label" in body) {
    const label =
      body.label != null && String(body.label).trim() ? String(body.label).trim().slice(0, 200) : null
    patch.label = label
  }

  if (body && typeof body.archived === "boolean") {
    if (body.archived) {
      patch.archived_at = new Date().toISOString()
      patch.archived_by = user.id
    } else {
      patch.archived_at = null
      patch.archived_by = null
    }
  }

  const { data: updated, error } = await admin
    .from("autopayout_configs")
    .update(patch)
    .eq("id", autopayoutId)
    .eq("business_id", ctx.businessId)
    .select(
      "id, recipient_id, label, crypto_currency, network, deposit_address, deposit_memo, status, archived_at, placard_hd_png_storage_path, placard_pdf_storage_path, placard_generated_at, placard_template_version, placard_content_hash, updated_at",
    )
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  return NextResponse.json({ autopayout: updated })
}
