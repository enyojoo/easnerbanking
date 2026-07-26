import { NextResponse } from "next/server"
import { requirePayrollAccess } from "@/lib/payroll/require-payroll-access"
import { createSupabaseAdmin } from "@/lib/supabase/admin"
import { approvePayrollRun } from "@/lib/payroll/execute-run"
import { resolveNoahAccountContextFromLedgerScope } from "@/lib/processing-fee/capture-pending-processing-fee"
import {
  mapRowToPayrollRun,
  mapRowToPayrollLine,
  type PayrollRunRow,
  type PayrollLineRow,
} from "@/lib/payroll/map-payroll"
import { recalculateRunTotals } from "@/lib/payroll/run-utils"
import { assertBusinessTransferAllowed } from "@/lib/business/high-value-policy"
import { requiresDifferentPayrollApprover } from "@/lib/payroll/approval-policy"

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctx = await requirePayrollAccess(request, ["approver"])
  if (!ctx.ok) return ctx.response

  const { id } = await params
  const body = (await request.json().catch(() => ({}))) as {
    mode?: "pay_now" | "schedule"
    scheduledAt?: string
  }
  const admin = createSupabaseAdmin()

  const { data: runRow } = await admin
    .from("payroll_runs")
    .select("*")
    .eq("id", id)
    .eq("business_id", ctx.businessId)
    .maybeSingle()

  if (!runRow) return NextResponse.json({ error: "Not found" }, { status: 404 })
  if (!["pending_approval", "needs_reapproval", "draft"].includes(String(runRow.status))) {
    return NextResponse.json({ error: "Run is not pending approval" }, { status: 400 })
  }
  const { data: payrollSettings } = await admin
    .from("payroll_settings")
    .select("require_separate_approver")
    .eq("business_id", ctx.businessId)
    .maybeSingle()
  if (requiresDifferentPayrollApprover({
    requireSeparateApprover: Boolean(payrollSettings?.require_separate_approver),
    businessRole: ctx.businessRole,
    submittedBy: runRow.submitted_by ? String(runRow.submitted_by) : null,
    approverUserId: ctx.userId,
  })) {
    return NextResponse.json({
      error: "A different payroll approver must approve this run.",
    }, { status: 403 })
  }

  const acc = await resolveNoahAccountContextFromLedgerScope(admin, {
    userId: ctx.userId,
    businessId: ctx.businessId,
  })
  if (!acc) return NextResponse.json({ error: "Business account not ready" }, { status: 400 })

  const totalSource =
    (typeof runRow.total_source_cents === "string"
      ? Number(runRow.total_source_cents)
      : Number(runRow.total_source_cents ?? 0)) / 100

  try {
    await assertBusinessTransferAllowed(
      admin,
      ctx.businessId,
      totalSource,
      String(runRow.source_currency || "USD"),
      ctx.userId,
    )
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Approval blocked by policy"
    return NextResponse.json({ error: msg }, { status: 403 })
  }

  const { data: approvalLines } = await admin
    .from("payroll_lines")
    .select("id,person_id,recipient_snapshot,amount_cents,pay_currency,payment_method_snapshot,rail")
    .eq("run_id", id)
    .neq("status", "skipped")
  const scheduleMode = body.mode === "schedule"
  if (scheduleMode && !body.scheduledAt) {
    return NextResponse.json({ error: "scheduledAt is required" }, { status: 400 })
  }

  try {
    await approvePayrollRun({
      admin,
      userId: ctx.userId,
      businessId: ctx.businessId,
      runId: id,
      noahCustomerId: acc.noahCustomerId,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Approval failed"
    return NextResponse.json({ error: msg }, { status: 500 })
  }

  const { data: lockedRun } = await admin
    .from("payroll_runs")
    .select("total_source_cents")
    .eq("id", id)
    .single()
  const approvedDebit = Number(lockedRun?.total_source_cents ?? 0) / 100
  const approvedAt = new Date().toISOString()
  const approvalSnapshot = {
    revision: Number(runRow.revision ?? 1),
    totalSource: approvedDebit,
    sourceCurrency: String(runRow.source_currency || "USD"),
    approvedDebit,
    approvedAt,
    people: (approvalLines ?? []).map((line) => ({
      lineId: line.id,
      personId: line.person_id,
      name: String((line.recipient_snapshot as Record<string, unknown>)?.fullName || "Payee"),
      amount: Number(line.amount_cents ?? 0) / 100,
      currency: String(line.pay_currency || "USD"),
      method: Object.keys((line.payment_method_snapshot as Record<string, unknown>) ?? {}).length
        ? line.payment_method_snapshot
        : { rail: line.rail },
    })),
  }
  await admin.from("payroll_runs").update({
    status: scheduleMode ? "scheduled" : "approved",
    approval_snapshot: approvalSnapshot,
    approved_at: approvedAt,
    ...(scheduleMode ? { scheduled_at: body.scheduledAt } : {}),
    updated_at: approvedAt,
  }).eq("id", id)
  await admin.from("payroll_run_events").insert({
    business_id: ctx.businessId,
    run_id: id,
    actor_user_id: ctx.userId,
    event_type: scheduleMode ? "run.scheduled" : "run.approved",
    data: { revision: approvalSnapshot.revision, approvedDebit },
  })

  await recalculateRunTotals(admin, id, ctx.businessId)

  await admin
    .from("business_approvals")
    .update({ status: "approved", updated_at: new Date().toISOString() })
    .eq("business_id", ctx.businessId)
    .eq("subject_type", "payroll_run")
    .eq("subject_id", id)
    .eq("status", "open")

  const { data: lines } = await admin.from("payroll_lines").select("*").eq("run_id", id)
  const run = mapRowToPayrollRun(
    (await admin.from("payroll_runs").select("*").eq("id", id).single()).data as PayrollRunRow,
    (lines ?? []).map((l) => mapRowToPayrollLine(l as PayrollLineRow)),
  )

  return NextResponse.json({ run })
}
