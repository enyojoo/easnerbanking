import { NextResponse } from "next/server"
import { requirePayrollAccess } from "@/lib/payroll/require-payroll-access"
import { createSupabaseAdmin } from "@/lib/supabase/admin"
import { enqueuePayrollExecution } from "@/lib/payroll/execution-jobs"
import { sanitizePayrollExecutionError } from "@/lib/payroll/execution-error"
import { isBusinessTier1Complete } from "@/lib/compliance/business-tier1"

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctx = await requirePayrollAccess(request, ["approver"])
  if (!ctx.ok) return ctx.response

  const { id } = await params
  const admin = createSupabaseAdmin()
  let transitionedScheduled = false

  const { data: business } = await admin
    .from("businesses")
    .select("verification_status,verification_provider,bridge_kyc_status")
    .eq("id", ctx.businessId)
    .maybeSingle()
  if (!isBusinessTier1Complete(business)) {
    return NextResponse.json(
      { error: "Business verification must be approved before executing payroll." },
      { status: 403 },
    )
  }

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
      await admin.from("payroll_runs").update({
        status: "approved",
        updated_at: new Date().toISOString(),
      }).eq("id", id).eq("business_id", ctx.businessId).eq("status", "scheduled")
      transitionedScheduled = true
    }
    const job = await enqueuePayrollExecution(admin, {
      runId: id,
      businessId: ctx.businessId,
    })
    return NextResponse.json(
      { queued: true, jobId: job.id, status: job.status },
      { status: 202 },
    )
  } catch (e) {
    if (transitionedScheduled) {
      await admin.from("payroll_runs").update({
        status: "scheduled",
        updated_at: new Date().toISOString(),
      }).eq("id", id).eq("business_id", ctx.businessId).eq("status", "approved")
    }
    const msg = sanitizePayrollExecutionError(e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
