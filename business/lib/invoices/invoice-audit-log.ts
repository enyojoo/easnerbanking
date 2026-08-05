import { createSupabaseAdmin } from "@/lib/supabase/admin"

export type InvoiceAuditAction =
  | "created"
  | "edited"
  | "status_changed"
  | "emailed"
  | "marked_paid"
  | "payment_refunded"
  | "viewed"
  | "voided"
  | "converted"

export async function writeInvoiceAuditLog(input: {
  invoiceId: string
  businessId: string
  actorUserId?: string | null
  action: InvoiceAuditAction
  changes?: Record<string, unknown> | null
}): Promise<void> {
  try {
    const admin = createSupabaseAdmin()
    const { error } = await admin.from("invoice_audit_log").insert({
      invoice_id: input.invoiceId,
      business_id: input.businessId,
      actor_user_id: input.actorUserId ?? null,
      action: input.action,
      changes: input.changes ?? null,
    })
    if (error) console.error("invoice_audit_log insert:", error)
  } catch (e) {
    console.error("writeInvoiceAuditLog:", e)
  }
}

export async function listInvoiceAuditLog(invoiceId: string) {
  const admin = createSupabaseAdmin()
  const { data, error } = await admin
    .from("invoice_audit_log")
    .select("id, actor_user_id, action, changes, created_at")
    .eq("invoice_id", invoiceId)
    .order("created_at", { ascending: false })
    .limit(100)

  if (error) {
    console.error("invoice_audit_log select:", error)
    return []
  }
  return data ?? []
}
