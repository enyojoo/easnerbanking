import { NextResponse } from "next/server"
import { requirePayrollAccess } from "@/lib/payroll/require-payroll-access"
import { createSupabaseAdmin } from "@/lib/supabase/admin"
import { approvePayrollRun, executePayrollRun } from "@/lib/payroll/execute-run"
import { sendPayrollStubEmailsForRun } from "@/lib/payroll/send-stub-email"
import { resolveNoahAccountContextFromLedgerScope } from "@/lib/processing-fee/capture-pending-processing-fee"
import {
  mapRowToPayrollRun,
  mapRowToPayrollLine,
  type PayrollRunRow,
  type PayrollLineRow,
} from "@/lib/payroll/map-payroll"

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctx = await requirePayrollAccess(request, ["approver"])
  if (!ctx.ok) return ctx.response

  const { id } = await params
  const admin = createSupabaseAdmin()

  try {
    const { data: pendingRun } = await admin
      .from("payroll_runs")
      .select("status,scheduled_at,approval_snapshot")
      .eq("id", id)
      .eq("business_id", ctx.businessId)
      .maybeSingle()
    if (pendingRun?.status === "scheduled") {
      if (!pendingRun.scheduled_at || new Date(pendingRun.scheduled_at).getTime() > Date.now()) {
        return NextResponse.json({ error: "This payroll is scheduled for a later time" }, { status: 409 })
      }
      const account = await resolveNoahAccountContextFromLedgerScope(admin, {
        userId: ctx.userId,
        businessId: ctx.businessId,
      })
      if (!account) return NextResponse.json({ error: "Business account not ready" }, { status: 400 })
      const approvedDebit = Number(
        (pendingRun.approval_snapshot as Record<string, unknown> | null)?.approvedDebit ?? 0,
      )
      await approvePayrollRun({
        admin,
        userId: ctx.userId,
        businessId: ctx.businessId,
        runId: id,
        noahCustomerId: account.noahCustomerId,
      })
      const { data: requoted } = await admin
        .from("payroll_runs")
        .select("total_source_cents")
        .eq("id", id)
        .single()
      const newDebit = Number(requoted?.total_source_cents ?? 0) / 100
      if (newDebit > approvedDebit) {
        await admin.from("payroll_runs").update({
          status: "needs_reapproval",
          updated_at: new Date().toISOString(),
        }).eq("id", id)
        await admin.from("payroll_run_events").insert({
          business_id: ctx.businessId,
          run_id: id,
          actor_user_id: ctx.userId,
          event_type: "run.reapproval_required",
          data: { approvedDebit, newDebit },
        })
        return NextResponse.json({
          error: "The source debit increased. Review and approve this payroll again.",
        }, { status: 409 })
      }
    }
    const result = await executePayrollRun({
      admin,
      userId: ctx.userId,
      businessId: ctx.businessId,
      runId: id,
    })

    await sendPayrollStubEmailsForRun(admin, ctx.businessId, id).catch(() => undefined)

    const { data: runRow } = await admin.from("payroll_runs").select("*").eq("id", id).maybeSingle()
    const { data: lines } = await admin.from("payroll_lines").select("*").eq("run_id", id)
    const run = runRow
      ? mapRowToPayrollRun(
          runRow as PayrollRunRow,
          (lines ?? []).map((l) => mapRowToPayrollLine(l as PayrollLineRow)),
        )
      : null

    return NextResponse.json({ run, ...result })
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Execution failed"
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
