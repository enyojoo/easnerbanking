import { NextResponse } from "next/server"
import { requireBusinessOrgWithRole, requireBusinessRole } from "@/lib/b2b/require-role"
import { createSupabaseAdmin } from "@/lib/supabase/admin"
import {
  mapRowToPayrollRun,
  mapRowToPayrollLine,
  amountToCents,
  type PayrollRunRow,
  type PayrollLineRow,
} from "@/lib/payroll/map-payroll"
import { recalculateRunTotals } from "@/lib/payroll/run-utils"
import { approvePayrollRun, executePayrollRun } from "@/lib/payroll/execute-run"
import { resolveNoahAccountContextFromLedgerScope } from "@/lib/processing-fee/capture-pending-processing-fee"
import { sendPayrollStubEmailsForRun } from "@/lib/payroll/send-stub-email"

async function loadRun(admin: ReturnType<typeof createSupabaseAdmin>, businessId: string, id: string) {
  const { data: runRow } = await admin
    .from("payroll_runs")
    .select("*")
    .eq("id", id)
    .eq("business_id", businessId)
    .maybeSingle()

  if (!runRow) return null

  const { data: lines } = await admin.from("payroll_lines").select("*").eq("run_id", id)

  return mapRowToPayrollRun(
    runRow as PayrollRunRow,
    (lines ?? []).map((l) => mapRowToPayrollLine(l as PayrollLineRow)),
  )
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctx = await requireBusinessOrgWithRole(request)
  if (!ctx.ok) return ctx.response

  const { id } = await params
  const admin = createSupabaseAdmin()
  const run = await loadRun(admin, ctx.businessId, id)
  if (!run) return NextResponse.json({ error: "Not found" }, { status: 404 })

  return NextResponse.json({ run })
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctx = await requireBusinessRole(request, ["Owner", "Admin", "Member"])
  if (!ctx.ok) return ctx.response

  const { id } = await params
  const body = (await request.json().catch(() => ({}))) as {
    lines?: Array<{ id: string; amount?: number; sourceAmount?: number; status?: string }>
    sourceCurrency?: string
  }

  const admin = createSupabaseAdmin()
  const { data: runRow } = await admin
    .from("payroll_runs")
    .select("status")
    .eq("id", id)
    .eq("business_id", ctx.businessId)
    .maybeSingle()

  if (!runRow) return NextResponse.json({ error: "Not found" }, { status: 404 })
  if (runRow.status !== "draft" && runRow.status !== "pending_approval") {
    return NextResponse.json({ error: "Run cannot be edited in current status" }, { status: 400 })
  }

  if (body.sourceCurrency) {
    await admin
      .from("payroll_runs")
      .update({
        source_currency: body.sourceCurrency.toUpperCase(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
  }

  for (const line of body.lines ?? []) {
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
    if (line.amount != null) {
      patch.amount_cents = amountToCents(line.amount)
      patch.source_amount_cents = amountToCents(line.sourceAmount ?? line.amount)
    }
    if (line.status === "skipped") patch.status = "skipped"
    await admin.from("payroll_lines").update(patch).eq("id", line.id).eq("run_id", id)
  }

  await recalculateRunTotals(admin, id, ctx.businessId)
  const run = await loadRun(admin, ctx.businessId, id)
  return NextResponse.json({ run })
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctx = await requireBusinessRole(request, ["Owner", "Admin", "Member"])
  if (!ctx.ok) return ctx.response

  const { id } = await params
  const body = (await request.json().catch(() => ({}))) as { action?: string }
  const action = body.action ?? "submit"

  const admin = createSupabaseAdmin()

  if (action === "submit") {
    await admin
      .from("payroll_runs")
      .update({ status: "pending_approval", updated_at: new Date().toISOString() })
      .eq("id", id)
      .eq("business_id", ctx.businessId)
      .eq("status", "draft")

    const { data: runRow } = await admin
      .from("payroll_runs")
      .select("total_source_cents, source_currency")
      .eq("id", id)
      .maybeSingle()

    if (runRow) {
      await admin.from("business_approvals").insert({
        business_id: ctx.businessId,
        status: "open",
        amount_cents: runRow.total_source_cents,
        currency: runRow.source_currency || "USD",
        requester_id: ctx.userId,
        subject_type: "payroll_run",
        subject_id: id,
        memo: "Payroll run approval",
      })
    }

    const run = await loadRun(admin, ctx.businessId, id)
    return NextResponse.json({ run })
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 })
}
