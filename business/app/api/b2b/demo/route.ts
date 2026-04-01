import { NextResponse } from "next/server"
import { createSupabaseAdmin } from "@/lib/supabase/admin"
import type { Customer } from "@/lib/mock-data"
import type { Invoice } from "@/lib/mock-data"

/**
 * Read-only B2B rows for the Business web app (maps to existing Customer/Invoice UI shapes).
 * In production, set ALLOW_B2B_DEMO_PUBLIC=true only for controlled demos (otherwise returns empty).
 */
export async function GET() {
  if (process.env.NODE_ENV === "production" && process.env.ALLOW_B2B_DEMO_PUBLIC !== "true") {
    return NextResponse.json({ customers: [], invoices: [] })
  }
  try {
    const admin = createSupabaseAdmin()
    const { data: rows, error } = await admin.from("easner_b2b_customers").select("*").order("created_at", { ascending: false }).limit(200)
    if (error) {
      return NextResponse.json({ customers: [] as Customer[], invoices: [] as Invoice[], error: error.message })
    }

    const customers: Customer[] = (rows ?? []).map((r) => ({
      id: r.id,
      name: r.name || "Customer",
      email: r.email || "",
      phone: r.phone || "",
      company: "",
      address: "",
      totalInvoices: 0,
      totalPaid: 0,
      currency: "USD",
      status: "active" as const,
      lastInvoiceDate: new Date(r.created_at).toISOString().slice(0, 10),
    }))

    const { data: invRows } = await admin.from("invoices").select("*").order("created_at", { ascending: false }).limit(200)
    const invoices: Invoice[] = (invRows ?? []).map((r) => {
      const total = Number(r.amount_cents ?? 0) / 100
      const due = r.due_date ? String(r.due_date) : new Date().toISOString().slice(0, 10)
      const created = r.created_at ? String(r.created_at).slice(0, 10) : due
      return {
        id: r.id,
        invoiceNumber: `EINV-${String(r.id).slice(0, 8)}`,
        customerName: "Customer",
        customerEmail: "",
        total,
        currency: r.currency || "USD",
        status: (r.status === "paid" ? "paid" : r.status === "draft" ? "draft" : "open") as Invoice["status"],
        dueDate: due,
        createdDate: created,
        finalizedDate: null,
        frequency: null,
        lineItems: [{ description: "Line item", quantity: 1, unitPrice: total, amount: total }],
      }
    })

    return NextResponse.json({ customers, invoices })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ customers: [], invoices: [], error: msg })
  }
}
