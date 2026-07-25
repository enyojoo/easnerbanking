import { NextResponse } from "next/server"
import { requireBusinessRole } from "@/lib/b2b/require-role"
import { createSupabaseAdmin } from "@/lib/supabase/admin"
import { executePayrollLine } from "@/lib/payroll/execute-run"
import type { PayrollLineRow, PayrollRunRow } from "@/lib/payroll/map-payroll"
import { sendPayrollStubForLine } from "@/lib/payroll/send-stub-email"

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctx = await requireBusinessRole(request, ["Owner", "Admin"])
  if (!ctx.ok) return ctx.response

  const { id: runId } = await params
  const body = (await request.json().catch(() => ({}))) as { lineIds?: string[] }

  const admin = createSupabaseAdmin()
  const { data: runRow } = await admin
    .from("payroll_runs")
    .select("*")
    .eq("id", runId)
    .eq("business_id", ctx.businessId)
    .maybeSingle()

  if (!runRow) return NextResponse.json({ error: "Run not found" }, { status: 404 })

  let q = admin.from("payroll_lines").select("*").eq("run_id", runId).eq("status", "failed")
  if (body.lineIds?.length) q = q.in("id", body.lineIds)

  const { data: lines } = await q
  const retried: string[] = []
  const failed: Array<{ id: string; error: string }> = []

  for (const line of lines ?? []) {
    const row = line as PayrollLineRow
    const result = await executePayrollLine({
      admin,
      userId: ctx.userId,
      businessId: ctx.businessId,
      line: row,
      run: runRow as PayrollRunRow,
      idempotencyKey: `payroll_line_retry:${row.id}:${Date.now()}`,
    })

    if (result.ok) {
      await admin
        .from("payroll_lines")
        .update({
          status: "paid",
          transfer_etid: result.transferEtid,
          error_code: null,
          error_message: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", row.id)
      retried.push(row.id)
      await sendPayrollStubForLine(admin, ctx.businessId, runId, row.id).catch(() => undefined)
    } else {
      failed.push({ id: row.id, error: result.error })
    }
  }

  return NextResponse.json({ retried, failed })
}
