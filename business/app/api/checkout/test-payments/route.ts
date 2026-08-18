import { NextResponse } from "next/server"
import { createSupabaseAdmin, getUserFromApiRequest } from "@/lib/supabase/admin"
import { requireEasnerBusinessId } from "@/lib/terminal/context"

type SessionRow = {
  id: string
  source: string
  gross_cents: number | null
  currency: string | null
  customer_email: string | null
  completed_at: string | null
}

/**
 * Completed Stripe *test* collections for this business. Live payments stay on
 * Transactions; this list is the Checkout popup.
 */
export async function GET(request: Request) {
  const user = await getUserFromApiRequest(request)
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const ctx = await requireEasnerBusinessId(user.id)
  if (!ctx.ok) return ctx.response

  const admin = createSupabaseAdmin()
  const { data, error } = await admin
    .from("online_checkout_sessions")
    .select("id, source, gross_cents, currency, customer_email, completed_at")
    .eq("business_id", ctx.businessId)
    .eq("livemode", false)
    .eq("status", "complete")
    .in("source", ["embed", "payment_link"])
    .order("completed_at", { ascending: false })
    .limit(50)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  const payments = ((data ?? []) as SessionRow[]).map((row) => ({
    id: row.id,
    source: row.source === "payment_link" ? "payment_link" : "embed",
    amountCents: Number(row.gross_cents ?? 0),
    currency: String(row.currency ?? "USD").toUpperCase(),
    customerEmail: row.customer_email,
    completedAt: row.completed_at,
  }))

  return NextResponse.json({ payments })
}
