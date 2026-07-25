import { NextResponse } from "next/server"
import { requirePayrollAccess } from "@/lib/payroll/require-payroll-access"
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
  const { data: documents } = await admin.from("payroll_documents")
    .select("id,line_id,filename")
    .eq("run_id", id)
    .eq("type", "pay_stub")
  const documentIds = (documents ?? []).map((document) => String(document.id))
  const { data: deliveries } = documentIds.length > 0
    ? await admin.from("payroll_document_deliveries")
        .select("document_id,status,created_at")
        .in("document_id", documentIds)
        .order("created_at", { ascending: false })
    : { data: [] }
  const documentByLine = new Map((documents ?? []).map((document) => [
    String(document.line_id),
    document,
  ]))
  const latestDeliveryByDocument = new Map<string, string>()
  for (const delivery of deliveries ?? []) {
    const documentId = String(delivery.document_id)
    if (!latestDeliveryByDocument.has(documentId)) {
      latestDeliveryByDocument.set(documentId, String(delivery.status))
    }
  }
  const mappedLines = (lines ?? []).map((line) => {
    const mapped = mapRowToPayrollLine(line as PayrollLineRow)
    const document = documentByLine.get(mapped.id)
    return {
      ...mapped,
      payrollDocumentFilename: document?.filename ? String(document.filename) : null,
      documentDeliveryStatus: document
        ? latestDeliveryByDocument.get(String(document.id)) as typeof mapped.documentDeliveryStatus
        : null,
    }
  })

  return mapRowToPayrollRun(
    runRow as PayrollRunRow,
    mappedLines,
  )
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctx = await requirePayrollAccess(request, ["viewer", "preparer", "approver"])
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
  const ctx = await requirePayrollAccess(request, ["preparer", "approver"])
  if (!ctx.ok) return ctx.response

  const { id } = await params
  const body = (await request.json().catch(() => ({}))) as {
    lines?: Array<{ id: string; amount?: number; sourceAmount?: number; status?: string }>
    sourceCurrency?: string
    revision?: number
    payPeriodStart?: string | null
    payPeriodEnd?: string | null
    payday?: string | null
    name?: string | null
    note?: string | null
  }

  const admin = createSupabaseAdmin()
  const { data: runRow } = await admin
    .from("payroll_runs")
    .select("status,revision,metadata")
    .eq("id", id)
    .eq("business_id", ctx.businessId)
    .maybeSingle()

  if (!runRow) return NextResponse.json({ error: "Not found" }, { status: 404 })
  if (runRow.status !== "draft") {
    return NextResponse.json({ error: "Run cannot be edited in current status" }, { status: 400 })
  }
  if (body.revision != null && Number(runRow.revision ?? 1) !== body.revision) {
    return NextResponse.json(
      { error: "This payroll run changed in another session. Refresh before saving.", code: "revision_conflict" },
      { status: 409 },
    )
  }

  if (body.sourceCurrency || body.payPeriodStart !== undefined || body.payPeriodEnd !== undefined || body.payday !== undefined || body.name !== undefined || body.note !== undefined) {
    const metadata = ((runRow.metadata as Record<string, unknown>) ?? {})
    await admin
      .from("payroll_runs")
      .update({
        ...(body.sourceCurrency ? { source_currency: body.sourceCurrency.toUpperCase() } : {}),
        ...(body.payPeriodStart !== undefined ? { pay_period_start: body.payPeriodStart } : {}),
        ...(body.payPeriodEnd !== undefined ? { pay_period_end: body.payPeriodEnd } : {}),
        ...(body.payday !== undefined ? { payday: body.payday } : {}),
        metadata: {
          ...metadata,
          ...(body.name !== undefined ? { name: body.name?.trim() || null } : {}),
          ...(body.note !== undefined ? { note: body.note?.trim() || null } : {}),
        },
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
  await admin
    .from("payroll_runs")
    .update({ revision: Number(runRow.revision ?? 1) + 1, updated_at: new Date().toISOString() })
    .eq("id", id)
  await admin.from("payroll_run_events").insert({
    business_id: ctx.businessId,
    run_id: id,
    actor_user_id: ctx.userId,
    event_type: "run.updated",
    data: { previousRevision: Number(runRow.revision ?? 1) },
  })
  const run = await loadRun(admin, ctx.businessId, id)
  return NextResponse.json({ run })
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctx = await requirePayrollAccess(request, ["preparer", "approver"])
  if (!ctx.ok) return ctx.response

  const { id } = await params
  const body = (await request.json().catch(() => ({}))) as { action?: string }
  const action = body.action ?? "submit"

  const admin = createSupabaseAdmin()

  if (action === "submit") {
    const { data: current } = await admin
      .from("payroll_runs")
      .select("*,payroll_lines(*)")
      .eq("id", id)
      .eq("business_id", ctx.businessId)
      .maybeSingle()
    if (!current) return NextResponse.json({ error: "Not found" }, { status: 404 })
    if (current.status !== "draft") {
      return NextResponse.json({ error: "Only a draft can be submitted" }, { status: 400 })
    }
    const activeLines = ((current.payroll_lines as Array<Record<string, unknown>>) ?? [])
      .filter((line) => line.status !== "skipped")
    const invalid = activeLines.filter((line) =>
      Number(line.amount_cents ?? 0) <= 0 ||
      !String(line.rail ?? "").trim() ||
      (line.rail === "easetag" && !String((line.recipient_snapshot as Record<string, unknown>)?.easetag ?? "").trim()) ||
      (line.rail !== "easetag" && !(line.recipient_snapshot as Record<string, unknown>)?.recipientId)
    )
    if (activeLines.length === 0 || invalid.length > 0 || Number(current.shortfall_cents ?? 0) > 0) {
      return NextResponse.json({
        error: Number(current.shortfall_cents ?? 0) > 0
          ? "Fund the payroll account before submitting."
          : "Resolve all amount and receiving-method issues before submitting.",
        issues: invalid.map((line) => ({ lineId: line.id, code: "not_ready" })),
      }, { status: 400 })
    }

    const submittedAt = new Date().toISOString()
    const updated = await admin
      .from("payroll_runs")
      .update({
        status: "pending_approval",
        submitted_at: submittedAt,
        submitted_by: ctx.userId,
        updated_at: submittedAt,
      })
      .eq("id", id)
      .eq("business_id", ctx.businessId)
      .eq("status", "draft")
      .select("id")
    if (updated.error || !updated.data?.length) {
      return NextResponse.json({ error: "Run could not be submitted" }, { status: 409 })
    }

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

    await admin.from("payroll_run_events").insert({
      business_id: ctx.businessId,
      run_id: id,
      actor_user_id: ctx.userId,
      event_type: "run.submitted",
      data: { revision: current.revision },
    })

    const run = await loadRun(admin, ctx.businessId, id)
    return NextResponse.json({ run })
  }

  if (action === "withdraw") {
    const { data } = await admin
      .from("payroll_runs")
      .update({
        status: "draft",
        submitted_at: null,
        submitted_by: null,
        approval_snapshot: null,
        revision: awaitRevisionIncrement(admin, id),
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .eq("business_id", ctx.businessId)
      .in("status", ["pending_approval", "needs_reapproval"])
      .select("id")
    if (!data?.length) return NextResponse.json({ error: "Run cannot be withdrawn" }, { status: 409 })
    await admin.from("business_approvals").update({ status: "rejected" })
      .eq("subject_type", "payroll_run").eq("subject_id", id).eq("status", "open")
    await admin.from("payroll_run_events").insert({
      business_id: ctx.businessId, run_id: id, actor_user_id: ctx.userId,
      event_type: "run.withdrawn", data: {},
    })
    return NextResponse.json({ run: await loadRun(admin, ctx.businessId, id) })
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 })
}

async function awaitRevisionIncrement(
  admin: ReturnType<typeof createSupabaseAdmin>,
  runId: string,
): Promise<number> {
  const { data } = await admin.from("payroll_runs").select("revision").eq("id", runId).maybeSingle()
  return Number(data?.revision ?? 1) + 1
}
