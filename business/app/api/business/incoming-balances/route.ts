import { NextResponse } from "next/server"
import { requireBusinessOrg } from "@/lib/b2b/resolve-org"
import { createSupabaseAdmin } from "@/lib/supabase/admin"
import { sumIncomingBalances, type IncomingSettlementRow } from "@/lib/stripe/incoming-balances"

const INCOMING_PHASES = ["payment_received", "payout_sent"] as const
const INCOMING_COLUMNS = "currency, net_cents, ledger_transaction_id"

/**
 * SUM(net_cents) of unsettled Stripe invoice + checkout settlements per currency.
 * Phases: payment_received | payout_sent (Incoming on Accounts cards).
 */
export async function GET(request: Request) {
  const ctx = await requireBusinessOrg(request)
  if (!ctx.ok) return ctx.response

  const admin = createSupabaseAdmin()
  const [invoices, checkouts] = await Promise.all([
    admin
      .from("invoice_stripe_settlements")
      .select(INCOMING_COLUMNS)
      .eq("business_id", ctx.businessId)
      .in("phase", INCOMING_PHASES),
    admin
      .from("checkout_stripe_settlements")
      .select(INCOMING_COLUMNS)
      .eq("business_id", ctx.businessId)
      .in("phase", INCOMING_PHASES),
  ])

  if (invoices.error) {
    return NextResponse.json({ error: invoices.error.message }, { status: 500 })
  }
  if (checkouts.error) {
    return NextResponse.json({ error: checkouts.error.message }, { status: 500 })
  }

  const rows = [...(invoices.data ?? []), ...(checkouts.data ?? [])] as IncomingSettlementRow[]
  const ledgerIds = [
    ...new Set(
      rows
        .map((row) => String(row.ledger_transaction_id ?? "").trim())
        .filter(Boolean),
    ),
  ]

  const existingLedgerIds = new Set<string>()
  if (ledgerIds.length > 0) {
    const { data: ledgerRows, error: ledgerError } = await admin
      .from("transactions")
      .select("id")
      .in("id", ledgerIds)
    if (ledgerError) {
      return NextResponse.json({ error: ledgerError.message }, { status: 500 })
    }
    for (const row of ledgerRows ?? []) {
      if (row.id) existingLedgerIds.add(String(row.id))
    }
  }

  const balances = sumIncomingBalances(rows, existingLedgerIds)

  return NextResponse.json({ balances })
}
