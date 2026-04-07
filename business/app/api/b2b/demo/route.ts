import { NextResponse } from "next/server"
import { mapRowToCustomerWithEmptyStats, type B2bCustomerRow } from "@/lib/b2b/map-customer"
import { mapRowToInvoice, type B2bInvoiceRow } from "@/lib/b2b/map-invoice"
import type { Customer } from "@/lib/b2b/types"
import type { Invoice } from "@/lib/b2b/types"
import { createSupabaseAdmin } from "@/lib/supabase/admin"

/**
 * Read-only B2B rows for controlled demos only (Business web app).
 * In production, set ALLOW_B2B_DEMO_PUBLIC=true — otherwise returns empty.
 */
export async function GET() {
  if (process.env.NODE_ENV === "production" && process.env.ALLOW_B2B_DEMO_PUBLIC !== "true") {
    return NextResponse.json({ customers: [], invoices: [] })
  }
  try {
    const admin = createSupabaseAdmin()
    const { data: rows, error } = await admin
      .from("business_customers")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200)
    if (error) {
      return NextResponse.json({
        customers: [] as Customer[],
        invoices: [] as Invoice[],
        error: error.message,
      })
    }

    const customers: Customer[] = (rows ?? []).map((r) =>
      mapRowToCustomerWithEmptyStats(r as B2bCustomerRow),
    )

    const { data: invRows } = await admin
      .from("invoices")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200)
    const invoices: Invoice[] = (invRows ?? []).map((r) => mapRowToInvoice(r as B2bInvoiceRow))

    return NextResponse.json({ customers, invoices })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ customers: [], invoices: [], error: msg })
  }
}
