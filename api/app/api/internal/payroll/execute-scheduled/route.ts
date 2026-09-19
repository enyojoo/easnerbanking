import { NextResponse } from "next/server"
import { assertInternalCronAuthorized } from "@/lib/api/internal-auth"
import { createSupabaseAdmin } from "@/lib/supabase/admin"
import { enqueuePayrollExecution } from "@/lib/payroll/execution-jobs"
import { sanitizePayrollExecutionError } from "@/lib/payroll/execution-error"

export async function GET(request: Request) {
  try {
    assertInternalCronAuthorized(request)
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  const admin = createSupabaseAdmin()
  const { data: runs, error } = await admin.from("payroll_runs")
    .select("id,business_id,approval_snapshot")
    .eq("status", "scheduled")
    .lte("scheduled_at", new Date().toISOString())
    .limit(25)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const completed: string[] = []
  const failed: Array<{ runId: string; error: string }> = []
  for (const run of runs ?? []) {
    const runId = String(run.id)
    const businessId = String(run.business_id)
    try {
      const { error: transitionError } = await admin.from("payroll_runs").update({
        status: "approved",
        updated_at: new Date().toISOString(),
      }).eq("id", runId).eq("business_id", businessId).eq("status", "scheduled")
      if (transitionError) throw new Error(transitionError.message)
      await enqueuePayrollExecution(admin, { runId, businessId })
      completed.push(runId)
    } catch (cause) {
      const message = sanitizePayrollExecutionError(cause)
      failed.push({ runId, error: message })
      await admin.from("payroll_run_events").insert({
        business_id: businessId,
        run_id: runId,
        event_type: "run.scheduled_execution_failed",
        data: { error: message },
      })
      await admin.from("payroll_runs").update({
        status: "scheduled",
        updated_at: new Date().toISOString(),
      }).eq("id", runId).eq("business_id", businessId).eq("status", "approved")
    }
  }
  return NextResponse.json({ processed: (runs ?? []).length, completed, failed })
}
