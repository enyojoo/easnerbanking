import { NextResponse } from "next/server"
import { requireBusinessRole } from "@/lib/b2b/require-role"
import { createSupabaseAdmin } from "@/lib/supabase/admin"
import { executePayrollRun } from "@/lib/payroll/execute-run"
import { sendPayrollStubEmailsForRun } from "@/lib/payroll/send-stub-email"
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
  const ctx = await requireBusinessRole(request, ["Owner", "Admin"])
  if (!ctx.ok) return ctx.response

  const { id } = await params
  const admin = createSupabaseAdmin()

  try {
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
