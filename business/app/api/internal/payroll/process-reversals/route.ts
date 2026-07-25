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
  const { data: reversals, error } = await admin.from("transactions")
    .select("id,easner_transaction_id,metadata,created_at")
    .eq("provider", "easner_internal")
    .eq("metadata->>source", "easetag_p2p_reversal")
    .eq("metadata->>leg", "debit_payee")
    .order("created_at")
    .limit(100)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  let generated = 0
  for (const reversal of reversals ?? []) {
    const metadata = (reversal.metadata as Record<string, unknown> | null) ?? {}
    const originalEtid = String(metadata.original_easner_transaction_id ?? "")
    if (!originalEtid) continue
    const { data: line } = await admin.from("payroll_lines")
      .select("id,run_id,payroll_runs(business_id)")
      .eq("transfer_etid", originalEtid)
      .maybeSingle()
    if (!line) continue
    const run = Array.isArray(line.payroll_runs) ? line.payroll_runs[0] : line.payroll_runs
    const businessId = String((run as Record<string, unknown> | null)?.business_id ?? "")
    if (!businessId) continue
    await sendPayrollStubForLine(admin, businessId, String(line.run_id), String(line.id), {
      documentType: "payment_reversal",
      reversalTransactionId: String(reversal.easner_transaction_id || reversal.id),
      reversalOccurredAt: String(reversal.created_at),
    }).catch(() => undefined)
    generated++
  }
  return NextResponse.json({ scanned: (reversals ?? []).length, generated })
}
