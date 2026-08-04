import { NextResponse } from "next/server"
import { requireBusinessOrg } from "@/lib/b2b/resolve-org"
import { createSupabaseAdmin } from "@/lib/supabase/admin"

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctx = await requireBusinessOrg(request)
  if (!ctx.ok) return ctx.response

  const { id } = await params
  if (!id) {
    return NextResponse.json({ error: "Invoice id required" }, { status: 400 })
  }

  const admin = createSupabaseAdmin()
  const { data, error } = await admin
    .from("invoice_stripe_settlements")
    .select(
      "id,phase,settlement_rail,gross_cents,fee_cents,net_cents,currency,ledger_transaction_id,expected_arrival_at,credited_at,stripe_payment_intent_id,stripe_payout_id,updated_at",
    )
    .eq("invoice_id", id)
    .eq("business_id", ctx.businessId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ settlement: data ?? null })
}
