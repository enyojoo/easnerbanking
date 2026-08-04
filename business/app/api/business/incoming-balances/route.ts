import { NextResponse } from "next/server"
import { requireBusinessOrg } from "@/lib/b2b/resolve-org"
import { createSupabaseAdmin } from "@/lib/supabase/admin"

/**
 * SUM(net_cents) of unsettled Stripe invoice settlements per currency.
 * Phases: payment_received | payout_sent (Incoming on Accounts cards).
 */
export async function GET(request: Request) {
  const ctx = await requireBusinessOrg(request)
  if (!ctx.ok) return ctx.response

  const admin = createSupabaseAdmin()
  const { data, error } = await admin
    .from("invoice_stripe_settlements")
    .select("currency, net_cents, phase")
    .eq("business_id", ctx.businessId)
    .in("phase", ["payment_received", "payout_sent"])

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const byCurrency: Record<string, number> = {}
  for (const row of data ?? []) {
    const currency = String(row.currency ?? "").toUpperCase()
    if (!currency) continue
    const cents = Number(row.net_cents ?? 0)
    if (!Number.isFinite(cents) || cents <= 0) continue
    byCurrency[currency] = (byCurrency[currency] ?? 0) + cents
  }

  const balances = Object.fromEntries(
    Object.entries(byCurrency).map(([currency, cents]) => [currency, cents / 100]),
  )

  return NextResponse.json({ balances })
}
