import { NextResponse } from "next/server"
import { createSupabaseAdmin, getUserFromApiRequest } from "@/lib/supabase/admin"
import { requireEasnerBusinessId } from "@/lib/terminal/context"

/** Disputes on Collections payments – shown in the Payments hub. */
export async function GET(request: Request) {
  const user = await getUserFromApiRequest(request)
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const ctx = await requireEasnerBusinessId(user.id)
  if (!ctx.ok) return ctx.response

  const admin = createSupabaseAdmin()
  const { data: rows, error } = await admin
    .from("checkout_disputes")
    .select(
      "id, amount_cents, currency, reason, status, evidence_due_by, evidence_submitted_at, stripe_charge_id, created_at, updated_at",
    )
    .eq("business_id", ctx.businessId)
    .order("created_at", { ascending: false })
    .limit(100)

  // Table missing (migration pending) reads as an empty list, not an error.
  return NextResponse.json({ disputes: error ? [] : rows ?? [] })
}
