import { NextResponse } from "next/server"
import { assertInternalCronAuthorized } from "@/lib/api/internal-auth"
import { createSupabaseAdmin } from "@/lib/supabase/admin"
import { reconcilePayrollRunSettlements } from "@/lib/payroll/execute-run"
import { sendPayrollStubEmailsForRun } from "@/lib/payroll/send-stub-email"
import { sendPayrollRunSummaryEmail } from "@/lib/payroll/send-run-summary-email"

/** Reconcile runs stuck in executing > 30 minutes — mark partial and leave line states as-is. */
export async function GET(request: Request) {
  try {
    assertInternalCronAuthorized(request)
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const admin = createSupabaseAdmin()
  const cutoff = new Date(Date.now() - 30 * 60 * 1000).toISOString()

  const { data: stuck } = await admin
    .from("payroll_runs")
    .select("id,business_id,updated_at")
    .eq("status", "executing")
    .lt("updated_at", cutoff)
    .limit(50)

  let reconciled = 0
  for (const run of stuck ?? []) {
    const result = await reconcilePayrollRunSettlements({
      admin,
      businessId: String(run.business_id),
      runId: String(run.id),
    })
    if (result.terminal) {
      await sendPayrollStubEmailsForRun(
        admin,
        String(run.business_id),
        String(run.id),
      ).catch(() => undefined)
      await sendPayrollRunSummaryEmail({
        admin,
        businessId: String(run.business_id),
        runId: String(run.id),
        completed: result.completed,
        failed: result.failed,
      }).catch(() => undefined)
      reconciled++
    }
  }

  return NextResponse.json({ reconciled })
}
