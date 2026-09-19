import { NextResponse } from "next/server"
import { requirePayrollAccess } from "@/lib/payroll/require-payroll-access"
import { createSupabaseAdmin } from "@/lib/supabase/admin"
import { enqueuePayrollExecution } from "@/lib/payroll/execution-jobs"

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctx = await requirePayrollAccess(request, ["approver"])
  if (!ctx.ok) return ctx.response

  const { id: runId } = await params
  const body = (await request.json().catch(() => ({}))) as {
    lineIds?: string[]
  }
  const admin = createSupabaseAdmin()
  const { data: run } = await admin
    .from("payroll_runs")
    .select("id,status")
    .eq("id", runId)
    .eq("business_id", ctx.businessId)
    .maybeSingle()

  if (!run) {
    return NextResponse.json({ error: "Run not found" }, { status: 404 })
  }
  if (!["failed", "partial", "executing"].includes(String(run.status))) {
    return NextResponse.json(
      { error: "This payroll run has no failed payments to retry." },
      { status: 400 },
    )
  }
  const { data: deadLetterJob } = await admin
    .from("payroll_execution_jobs")
    .select("id")
    .eq("run_id", runId)
    .eq("status", "dead_letter")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  let failedLinesQuery = admin
    .from("payroll_lines")
    .select("id,metadata")
    .eq("run_id", runId)
    .eq("status", "failed")
  if (body.lineIds?.length) {
    failedLinesQuery = failedLinesQuery.in("id", body.lineIds)
  }
  const { data: failedLines, error: failedLinesError } = await failedLinesQuery
  if (failedLinesError) {
    return NextResponse.json({ error: failedLinesError.message }, { status: 500 })
  }
  if (!failedLines?.length && !deadLetterJob) {
    return NextResponse.json(
      { error: "No eligible failed payments were found." },
      { status: 400 },
    )
  }

  const retried = (failedLines ?? []).map((line) => String(line.id))
  for (const line of failedLines ?? []) {
    const metadata =
      (line.metadata as Record<string, unknown> | null) ?? {}
    const { executePayload: _discardedQuote, ...retainedMetadata } = metadata
    const { error } = await admin
      .from("payroll_lines")
      .update({
        status: "pending",
        lock_id: null,
        source_amount_cents: 0,
        transfer_etid: null,
        settled_at: null,
        error_code: null,
        error_message: null,
        metadata: retainedMetadata,
        updated_at: new Date().toISOString(),
      })
      .eq("id", line.id)
      .eq("run_id", runId)
      .eq("status", "failed")
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
  }

  await admin.from("payroll_runs").update({
    status: "approved",
    shortfall_cents: 0,
    executed_at: null,
    updated_at: new Date().toISOString(),
  }).eq("id", runId).eq("business_id", ctx.businessId)

  const job = await enqueuePayrollExecution(admin, {
    runId,
    businessId: ctx.businessId,
  })
  await admin.from("payroll_execution_jobs").update({
    status: "queued",
    phase: "quoting",
    failure_attempts: 0,
    processed_lines: 0,
    next_attempt_at: new Date().toISOString(),
    lease_expires_at: null,
    last_error: null,
    updated_at: new Date().toISOString(),
  }).eq("id", job.id)

  await admin.from("payroll_run_events").insert({
    business_id: ctx.businessId,
    run_id: runId,
    actor_user_id: ctx.userId,
    event_type: "run.retry_queued",
    data: { lineIds: retried },
  })

  return NextResponse.json({
    queued: true,
    retried,
    jobId: job.id,
  })
}
