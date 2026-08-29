import { NextResponse } from "next/server"
import { assertInternalCronAuthorized } from "@/lib/api/internal-auth"
import { createSupabaseAdmin } from "@/lib/supabase/admin"

/**
 * Publication health check (docs/speed-ux-plan.md, Phase B3A.3).
 *
 * The realtime bridge looks "healthy" the moment the channel subscribes —
 * even against a table that was never added to the `supabase_realtime`
 * publication, in which case it receives zero events and the polling
 * fallback stays disabled. This cron-driven check compares the publication's
 * actual membership against every table the shared and office bridges
 * subscribe to and fails loudly on drift.
 */
const REQUIRED_PUBLICATION_TABLES = [
  "transactions",
  "wallet_balances",
  "cards",
  "payment_links",
  "checkout_stripe_settlements",
  "invoice_stripe_settlements",
  "invoices",
  "payroll_runs",
  "notifications",
  "user_preferences",
  "businesses",
  "business_kyb_applications",
  "users",
  "business_stripe_connect_accounts",
  "business_checkout_settings",
  "business_customers",
  "terminal_sessions",
  "event_inbox",
  "account_statements",
  "system_settings",
  "currencies",
  "exchange_rates",
  "noah_rates",
  "yellowcard_rates",
  "grid_rates",
  "crypto_rates",
  "payout_corridors",
  "crypto_destinations",
  "processing_fee_schedule",
  "processing_fee_overrides",
  "business_checkout_fee_overrides",
] as const

export async function GET(request: Request) {
  try {
    assertInternalCronAuthorized(request)
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const admin = createSupabaseAdmin()
  const { data, error } = await admin.rpc("realtime_publication_tables")

  if (error) {
    console.error("[realtime-publication-check] RPC failed:", error.message)
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  }

  const present = new Set((data as string[] | null) ?? [])
  const missing = REQUIRED_PUBLICATION_TABLES.filter((table) => !present.has(table))

  if (missing.length > 0) {
    console.error(
      `[realtime-publication-check] FAILED — missing from supabase_realtime publication: ${missing.join(", ")}. ` +
        "Realtime consumers for these tables receive no events while reporting healthy. " +
        "Apply supabase/migrations/20260825120000_realtime_money_tables_publication.sql and 20260829230000_office_realtime_publication.sql.",
    )
    return NextResponse.json({ ok: false, missing }, { status: 500 })
  }

  return NextResponse.json({ ok: true, tables: present.size })
}
