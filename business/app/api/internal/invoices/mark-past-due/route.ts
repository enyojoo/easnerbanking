import { NextResponse } from "next/server"
import { assertInternalCronAuthorized } from "@/lib/api/internal-auth"
import { mapRowToInvoice, mergeInvoicePatch, invoiceToDbPayload, type B2bInvoiceRow } from "@/lib/b2b/map-invoice"
import { shouldTransitionToPastDue } from "@/lib/invoices/past-due"
import { dispatchInvoiceWebhooks } from "@/lib/invoices/invoice-webhooks"
import { createSupabaseAdmin } from "@/lib/supabase/admin"

const BATCH_LIMIT = 500

export async function GET(request: Request) {
  try {
    assertInternalCronAuthorized(request)
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const admin = createSupabaseAdmin()
  const today = new Date().toISOString().slice(0, 10)

  const { data: rows, error } = await admin
    .from("invoices")
    .select("*")
    .in("status", ["open", "sent"])
    .lt("due_date", today)
    .limit(BATCH_LIMIT)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  let updated = 0
  for (const row of rows ?? []) {
    const b2b = row as B2bInvoiceRow
    const existing = mapRowToInvoice(b2b)
    if (!shouldTransitionToPastDue(existing)) continue

    const merged = mergeInvoicePatch(existing, {
      status: "past_due",
      statusHistory: [
        ...(existing.statusHistory ?? []),
        { status: "past_due", timestamp: new Date().toISOString() },
      ],
    })

    const payload = invoiceToDbPayload({
      businessId: b2b.business_id,
      customerId: b2b.customer_id,
      invoice: { ...merged, id: b2b.id },
      invoiceNumber: b2b.invoice_number,
    })

    const { error: upErr } = await admin.from("invoices").update(payload).eq("id", b2b.id)
    if (!upErr) {
      updated++
      void dispatchInvoiceWebhooks({
        businessId: b2b.business_id,
        event: "invoice.past_due",
        payload: { invoiceId: b2b.id, invoiceNumber: b2b.invoice_number },
      })
    }
  }

  return NextResponse.json({ ok: true, updated, scanned: (rows ?? []).length })
}
