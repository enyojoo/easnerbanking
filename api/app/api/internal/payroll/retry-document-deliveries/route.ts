import { NextResponse } from "next/server"
import { assertInternalCronAuthorized } from "@/lib/api/internal-auth"
import { createSupabaseAdmin } from "@/lib/supabase/admin"
import { sendPayrollStubForLine } from "@/lib/payroll/send-stub-email"

export async function GET(request: Request) {
  try {
    assertInternalCronAuthorized(request)
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  const admin = createSupabaseAdmin()
  const { data: deliveries, error } = await admin.from("payroll_document_deliveries")
    .select("id,document_id,attempts")
    .eq("status", "failed")
    .lt("attempts", 5)
    .order("updated_at")
    .limit(50)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  let sent = 0
  let failed = 0
  for (const delivery of deliveries ?? []) {
    const { data: document } = await admin.from("payroll_documents")
      .select("business_id,run_id,line_id")
      .eq("id", delivery.document_id)
      .eq("status", "ready")
      .maybeSingle()
    if (!document) continue
    try {
      await sendPayrollStubForLine(
        admin,
        String(document.business_id),
        String(document.run_id),
        String(document.line_id),
        {
          forceEmail: true,
          deliveryId: String(delivery.id),
          deliveryAttempts: Number(delivery.attempts ?? 0),
        },
      )
      sent++
    } catch {
      failed++
    }
  }
  return NextResponse.json({ processed: (deliveries ?? []).length, sent, failed })
}
