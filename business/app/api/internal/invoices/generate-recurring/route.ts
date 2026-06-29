import { NextResponse } from "next/server"
import { assertInternalCronAuthorized } from "@/lib/api/internal-auth"
import { mapRowToInvoice, invoiceToDbPayload, type B2bInvoiceRow } from "@/lib/b2b/map-invoice"
import { generateInvoiceId, formatInvoiceNumberFromClientId } from "@/lib/invoice-id"
import { createSupabaseAdmin } from "@/lib/supabase/admin"

function nextRunDate(frequency: string, from: Date): string {
  const d = new Date(from)
  switch (frequency) {
    case "weekly":
      d.setDate(d.getDate() + 7)
      break
    case "monthly":
      d.setMonth(d.getMonth() + 1)
      break
    case "quarterly":
      d.setMonth(d.getMonth() + 3)
      break
    case "yearly":
      d.setFullYear(d.getFullYear() + 1)
      break
    default:
      d.setMonth(d.getMonth() + 1)
  }
  return d.toISOString().slice(0, 10)
}

export async function GET(request: Request) {
  try {
    assertInternalCronAuthorized(request)
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const admin = createSupabaseAdmin()
  const today = new Date().toISOString().slice(0, 10)

  const { data: schedules, error } = await admin
    .from("invoice_schedules")
    .select("*")
    .eq("active", true)
    .lte("next_run_at", today)
    .limit(100)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  let created = 0
  for (const sched of schedules ?? []) {
    const template = (sched.template ?? {}) as Record<string, unknown>
    const base = template as Partial<ReturnType<typeof mapRowToInvoice>>
    const id = generateInvoiceId()
    const now = new Date().toISOString()
    const invoice = {
      id,
      invoiceNumber: formatInvoiceNumberFromClientId(id),
      customerName: String(base.customerName ?? ""),
      customerEmail: String(base.customerEmail ?? ""),
      total: Number(base.total ?? 0),
      currency: String(base.currency ?? "USD"),
      status: "draft" as const,
      dueDate: today,
      createdDate: now,
      finalizedDate: null,
      frequency: sched.frequency as string,
      lineItems: Array.isArray(base.lineItems) ? base.lineItems : [],
      ...base,
    }

    const payload = invoiceToDbPayload({
      businessId: sched.business_id as string,
      customerId: (sched.customer_id as string | null) ?? null,
      invoice: invoice as ReturnType<typeof mapRowToInvoice>,
    })

    const { error: insErr } = await admin.from("invoices").insert(payload)
    if (insErr) continue

    created++
    await admin
      .from("invoice_schedules")
      .update({
        next_run_at: nextRunDate(String(sched.frequency), new Date(today)),
        updated_at: now,
      })
      .eq("id", sched.id)
  }

  return NextResponse.json({ ok: true, created, scanned: (schedules ?? []).length })
}
