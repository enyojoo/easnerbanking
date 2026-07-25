import { NextResponse } from "next/server"
import { requireBusinessRole } from "@/lib/b2b/require-role"
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

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctx = await requireBusinessRole(request, ["Owner", "Admin"])
  if (!ctx.ok) return ctx.response

  const { id } = await params
  const admin = createSupabaseAdmin()

  const { data: runRow } = await admin
    .from("payroll_runs")
    .select("*")
    .eq("id", id)
    .eq("business_id", ctx.businessId)
    .maybeSingle()

  if (!runRow) return NextResponse.json({ error: "Not found" }, { status: 404 })
  if (runRow.status !== "pending_approval" && runRow.status !== "draft") {
    return NextResponse.json({ error: "Run is not pending approval" }, { status: 400 })
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
