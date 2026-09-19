import { NextResponse } from "next/server"
import { assertInternalCronAuthorized } from "@/lib/api/internal-auth"
import { type B2bInvoiceRow } from "@/lib/b2b/map-invoice"
import { invoicesDueForReminder, sendInvoiceReminder } from "@/lib/invoice-reminder-service"
import { parseBusinessInvoiceSettings } from "@/lib/invoices/invoice-settings"
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
    .in("status", ["unpaid", "sent", "past_due"])
    .limit(BATCH_LIMIT)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const businessIds = [
    ...new Set(
      ((rows ?? []) as B2bInvoiceRow[])
        .map((r) => r.business_id)
        .filter((id): id is string => typeof id === "string" && id.length > 0),
    ),
  ]

  const settingsByBusiness = new Map<
    string,
    { sendDueDateReminder: boolean; sendOverdueReminder: boolean }
  >()
  if (businessIds.length > 0) {
    const { data: businesses } = await admin
      .from("businesses")
      .select("id, invoice_settings")
      .in("id", businessIds)
    for (const biz of businesses ?? []) {
      const parsed = parseBusinessInvoiceSettings(biz.invoice_settings)
      settingsByBusiness.set(biz.id as string, {
        sendDueDateReminder: parsed.sendDueDateReminder !== false,
        sendOverdueReminder: parsed.sendOverdueReminder !== false,
      })
    }
  }

  const due: { row: B2bInvoiceRow; type: "due_today" | "overdue_7d" }[] = []
  for (const row of (rows ?? []) as B2bInvoiceRow[]) {
    const settings = settingsByBusiness.get(row.business_id) ?? {
      sendDueDateReminder: true,
      sendOverdueReminder: true,
    }
    due.push(...invoicesDueForReminder([row], today, settings))
  }

  let sent = 0
  for (const { row, type } of due.slice(0, 50)) {
    const ok = await sendInvoiceReminder(row, type)
    if (ok) sent++
  }

  return NextResponse.json({ ok: true, sent, eligible: due.length })
}
