import { NextResponse } from "next/server"
import { assertInternalCronAuthorized } from "@/lib/api/internal-auth"
import { createSupabaseAdmin } from "@/lib/supabase/admin"
import { executePayrollRun } from "@/lib/payroll/execute-run"
import { resolveBusinessOrgOwnerUserId } from "@/lib/business/org-owner"

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
    const { data: lines } = await admin
      .from("payroll_lines")
      .select("status")
      .eq("run_id", run.id)

    const paid = (lines ?? []).some((l) => l.status === "paid")
    const failed = (lines ?? []).some((l) => l.status === "failed")
    const status = paid && failed ? "partial" : failed ? "failed" : "completed"

    await admin
      .from("payroll_runs")
      .update({ status, updated_at: new Date().toISOString() })
      .eq("id", run.id)

    reconciled++
  }

  return NextResponse.json({ reconciled })
}
