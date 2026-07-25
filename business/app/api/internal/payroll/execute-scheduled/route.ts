import { NextResponse } from "next/server"
import { assertInternalCronAuthorized } from "@/lib/api/internal-auth"
import { createSupabaseAdmin } from "@/lib/supabase/admin"
import { approvePayrollRun, executePayrollRun } from "@/lib/payroll/execute-run"
import { resolveBusinessOrgOwnerUserId } from "@/lib/business/org-owner"
import { resolveNoahAccountContextFromLedgerScope } from "@/lib/processing-fee/capture-pending-processing-fee"
import { sendPayrollStubEmailsForRun } from "@/lib/payroll/send-stub-email"

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
  const needsReapproval: string[] = []
  const failed: Array<{ runId: string; error: string }> = []
  for (const run of runs ?? []) {
    const runId = String(run.id)
    const businessId = String(run.business_id)
    try {
      const userId = await resolveBusinessOrgOwnerUserId(admin, businessId)
      if (!userId) throw new Error("Business owner unavailable")
      const account = await resolveNoahAccountContextFromLedgerScope(admin, { userId, businessId })
      if (!account) throw new Error("Business account not ready")
      const approvedDebit = Number(
        (run.approval_snapshot as Record<string, unknown> | null)?.approvedDebit ?? 0,
      )
      await approvePayrollRun({
        admin,
        userId,
        businessId,
        runId,
        noahCustomerId: account.noahCustomerId,
      })
      const { data: requoted } = await admin.from("payroll_runs")
        .select("total_source_cents").eq("id", runId).single()
      const newDebit = Number(requoted?.total_source_cents ?? 0) / 100
      if (newDebit > approvedDebit) {
        await admin.from("payroll_runs").update({
          status: "needs_reapproval",
          updated_at: new Date().toISOString(),
        }).eq("id", runId)
        await admin.from("payroll_run_events").insert({
          business_id: businessId,
          run_id: runId,
          event_type: "run.reapproval_required",
          data: { approvedDebit, newDebit },
        })
        needsReapproval.push(runId)
        continue
      }
      await executePayrollRun({ admin, userId, businessId, runId })
      await sendPayrollStubEmailsForRun(admin, businessId, runId)
      completed.push(runId)
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Scheduled payroll failed"
      failed.push({ runId, error: message })
      await admin.from("payroll_run_events").insert({
        business_id: businessId,
        run_id: runId,
        event_type: "run.scheduled_execution_failed",
        data: { error: message },
      })
    }
  }
  return NextResponse.json({ processed: (runs ?? []).length, completed, needsReapproval, failed })
}
