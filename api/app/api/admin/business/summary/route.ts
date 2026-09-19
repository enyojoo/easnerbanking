import { NextResponse } from "next/server"
import { createSupabaseAdmin } from "@/lib/supabase/admin"
import { requireOfficeAdmin } from "@/lib/api/admin-auth"

export async function GET(request: Request) {
  const auth = await requireOfficeAdmin(request)
  if (!auth.ok) return auth.response

  const admin = createSupabaseAdmin()
  const [orgs, customers, invoices] = await Promise.all([
    admin.from("businesses").select("id", { count: "exact", head: true }),
    admin.from("business_customers").select("id", { count: "exact", head: true }),
    admin.from("invoices").select("id", { count: "exact", head: true }),
  ])

  const firstErr = orgs.error || customers.error || invoices.error
  if (firstErr) {
    console.error("admin business summary:", firstErr)
    return NextResponse.json(
      {
        error: firstErr.message,
        hint: "Ensure `business_customers` exists (rename/migrate from legacy `b2b_customers` if needed).",
      },
      { status: 500 },
    )
  }

  return NextResponse.json({
    businessCount: orgs.count ?? 0,
    b2bCustomerCount: customers.count ?? 0,
    invoiceCount: invoices.count ?? 0,
  })
}
