import { NextResponse } from "next/server"
import { assertInternalCronAuthorized } from "@/lib/api/internal-auth"
import { type B2bInvoiceRow } from "@/lib/b2b/map-invoice"
import { invoicesDueForReminder, sendInvoiceReminder } from "@/lib/invoice-reminder-service"
import { createSupabaseAdmin } from "@/lib/supabase/admin"

const BATCH_LIMIT = 200

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
    .in("status", ["open", "sent", "past_due"])
    .limit(BATCH_LIMIT)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const due = invoicesDueForReminder((rows ?? []) as B2bInvoiceRow[], today)
  let sent = 0
  for (const { row, type } of due.slice(0, 50)) {
    const ok = await sendInvoiceReminder(row, type)
    if (ok) sent++
  }

  return NextResponse.json({ ok: true, sent, eligible: due.length })
}
