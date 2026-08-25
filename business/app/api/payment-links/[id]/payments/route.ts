import { NextResponse } from "next/server"
import { createSupabaseAdmin, getUserFromApiRequest } from "@/lib/supabase/admin"
import { requireEasnerBusinessId } from "@/lib/terminal/context"

/**
 * Payments collected through one payment link – the drill-down behind the
 * "N payments" count, and where a payment can be refunded from.
 */
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getUserFromApiRequest(request)
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const ctx = await requireEasnerBusinessId(user.id)
  if (!ctx.ok) return ctx.response

  const { id } = await context.params
  const admin = createSupabaseAdmin()

  const { data: settlements, error } = await admin
    .from("checkout_stripe_settlements")
    .select("id, gross_cents, fee_cents, net_cents, currency, phase, created_at, checkout_session_id")
    .eq("business_id", ctx.businessId)
    .eq("payment_link_id", id)
    .order("created_at", { ascending: false })
    .limit(100)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const sessionIds = (settlements ?? [])
    .map((row) => (row.checkout_session_id ? String(row.checkout_session_id) : null))
    .filter((value): value is string => Boolean(value))

  const emails = new Map<string, string>()
  if (sessionIds.length > 0) {
    const { data: sessions } = await admin
      .from("online_checkout_sessions")
      .select("id, customer_email")
      .in("id", sessionIds)
    for (const session of sessions ?? []) {
      if (typeof session.customer_email === "string" && session.customer_email.trim()) {
        emails.set(String(session.id), session.customer_email.trim())
      }
    }
  }

  return NextResponse.json({
    payments: (settlements ?? []).map((row) => ({
      settlementId: String(row.id),
      paidAt: row.created_at,
      grossCents: Number(row.gross_cents ?? 0),
      netCents: Number(row.net_cents ?? 0),
      currency: String(row.currency ?? "USD"),
      phase: String(row.phase ?? "payment_received"),
      customerEmail: row.checkout_session_id
        ? emails.get(String(row.checkout_session_id)) ?? null
        : null,
    })),
  })
}
