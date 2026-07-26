import { NextResponse } from "next/server"
import { requirePayrollAccess } from "@/lib/payroll/require-payroll-access"
import { createSupabaseAdmin } from "@/lib/supabase/admin"
import {
  mapRowToPayrollRun,
  mapRowToPayrollLine,
  mapRowToPayrollPerson,
  amountToCents,
  type PayrollRunRow,
  type PayrollLineRow,
  type PayrollPersonRow,
} from "@/lib/payroll/map-payroll"
import { recalculateRunTotals } from "@/lib/payroll/run-utils"
import { buildPayrollLines } from "@/lib/payroll/build-lines"
import type { PayrollRunDraftInput } from "@/lib/payroll/types"
import { approvePayrollRun, executePayrollRun } from "@/lib/payroll/execute-run"
import { resolveNoahAccountContextFromLedgerScope } from "@/lib/processing-fee/capture-pending-processing-fee"
import { sendPayrollStubEmailsForRun } from "@/lib/payroll/send-stub-email"
import { canDeletePayrollRun, DELETABLE_PAYROLL_RUN_STATUSES } from "@/lib/payroll/run-deletion"
import { payrollScheduleOccurrence } from "@/lib/payroll/schedule-preview"

async function loadRun(admin: ReturnType<typeof createSupabaseAdmin>, businessId: string, id: string) {
  const { data: runRow } = await admin
    .from("payroll_runs")
    .select("*")
    .eq("id", id)
    .eq("business_id", businessId)
    .maybeSingle()

  if (!runRow) return null

  const { data: lines } = await admin.from("payroll_lines").select("*").eq("run_id", id)
  const { data: documents } = await admin
    .from("payroll_documents")
    .select("id,line_id,filename")
    .eq("run_id", id)
    .eq("type", "pay_stub")
  const documentIds = (documents ?? []).map((document) => String(document.id))
  const { data: deliveries } =
    documentIds.length > 0
      ? await admin
          .from("payroll_document_deliveries")
          .select("document_id,status,created_at")
          .in("document_id", documentIds)
          .order("created_at", { ascending: false })
      : { data: [] }
  const documentByLine = new Map((documents ?? []).map((document) => [String(document.line_id), document]))
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
        ? (latestDeliveryByDocument.get(String(document.id)) as typeof mapped.documentDeliveryStatus)
        : null,
    }
  })
  return mapRowToPayrollRun(runRow as PayrollRunRow, mappedLines)
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requirePayrollAccess(request, ["viewer", "preparer", "approver"])
  if (!ctx.ok) return ctx.response

  const { id } = await params
  const admin = createSupabaseAdmin()
  const run = await loadRun(admin, ctx.businessId, id)
  if (!run) return NextResponse.json({ error: "Not found" }, { status: 404 })

  return NextResponse.json({ run })
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requirePayrollAccess(request, ["preparer", "approver"])
  if (!ctx.ok) return ctx.response

  const { id } = await params
  const body = (await request.json().catch(() => ({}))) as {
    draft?: PayrollRunDraftInput
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

  if (body.draft) {
    const draft = body.draft
    const personIds = draft.lines.map((line) => line.personId)
    const uniquePersonIds = [...new Set(personIds)]
    let scheduleName: string | null = null
    let effectivePayPeriodStart = draft.payPeriodStart
    let effectivePayPeriodEnd = draft.payPeriodEnd
    let effectivePayday = draft.payday
    if (draft.scheduleId) {
      const { data: schedule, error: scheduleError } = await admin
        .from("payroll_schedules")
        .select("id,name,frequency,next_run_at,template,active")
        .eq("id", draft.scheduleId)
        .eq("business_id", ctx.businessId)
        .maybeSingle()
      if (scheduleError) return NextResponse.json({ error: scheduleError.message }, { status: 500 })
      if (!schedule || !schedule.active) {
        return NextResponse.json({ error: "The selected payroll schedule is unavailable." }, { status: 400 })
      }
      const occurrence = payrollScheduleOccurrence({
        frequency: schedule.frequency,
        nextRunAt: String(schedule.next_run_at),
        weekendPolicy: (schedule.template as Record<string, unknown> | null)?.weekendPolicy,
      })
      if (!occurrence) {
        return NextResponse.json({ error: "The selected schedule does not have a valid next payday." }, { status: 400 })
      }
      scheduleName = String(schedule.name)
      effectivePayPeriodStart = occurrence.payPeriodStart
      effectivePayPeriodEnd = occurrence.payPeriodEnd
      effectivePayday = occurrence.payday
    }
    if (
      !draft.name?.trim() ||
      !effectivePayPeriodStart ||
      !effectivePayPeriodEnd ||
      !effectivePayday ||
      uniquePersonIds.length === 0 ||
      uniquePersonIds.length !== personIds.length ||
      effectivePayPeriodStart > effectivePayPeriodEnd ||
      draft.lines.some((line) => !Number.isFinite(Number(line.amount)) || Number(line.amount) <= 0)
    ) {
      return NextResponse.json(
        { error: "Complete the payroll details, people, and amounts before saving." },
        { status: 400 },
      )
    }
    const { data: peopleRows } = await admin
      .from("payroll_people")
      .select("*")
      .eq("business_id", ctx.businessId)
      .in("id", uniquePersonIds)
    const people = (peopleRows ?? []).map((row) => mapRowToPayrollPerson(row as PayrollPersonRow))
    if (
      people.length !== uniquePersonIds.length ||
      people.some((person) => person.status !== "active" || person.readinessStatus !== "ready")
    ) {
      return NextResponse.json(
        { error: "One or more selected people are unavailable or not ready for payroll." },
        { status: 400 },
      )
    }

    const replacementLines = await buildPayrollLines(admin, id, people)
    const amountByPerson = new Map(draft.lines.map((line) => [line.personId, Number(line.amount)]))
    for (const line of replacementLines) {
      const amount = amountByPerson.get(String(line.person_id)) ?? 0
      line.amount_cents = amountToCents(amount)
      line.source_amount_cents = amountToCents(amount)
      line.pay_currency = String(draft.sourceCurrency || "USD").toUpperCase()
    }

    const { data: oldLines } = await admin.from("payroll_lines").select("id").eq("run_id", id)
    const { data: insertedLines, error: insertError } = await admin
      .from("payroll_lines")
      .insert(replacementLines)
      .select("id")
    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 500 })
    }
    const insertedIds = (insertedLines ?? []).map((line) => String(line.id))
    const oldIds = (oldLines ?? []).map((line) => String(line.id))
    if (oldIds.length) {
      const deleted = await admin.from("payroll_lines").delete().in("id", oldIds).eq("run_id", id)
      if (deleted.error) {
        if (insertedIds.length) await admin.from("payroll_lines").delete().in("id", insertedIds)
        return NextResponse.json({ error: deleted.error.message }, { status: 500 })
      }
    }

    const metadata = (runRow.metadata as Record<string, unknown>) ?? {}
    const updatedRun = await admin
      .from("payroll_runs")
      .update({
        schedule_id: draft.scheduleId || null,
        pay_period_start: effectivePayPeriodStart,
        pay_period_end: effectivePayPeriodEnd,
        payday: effectivePayday,
        scheduled_for: effectivePayday,
        source_currency: String(draft.sourceCurrency || "USD").toUpperCase(),
        metadata: {
          ...metadata,
          name: draft.name.trim(),
          offCycle: Boolean(draft.offCycle),
          ...(scheduleName ? { scheduleName } : { scheduleName: null }),
        },
        revision: Number(runRow.revision ?? 1) + 1,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .eq("business_id", ctx.businessId)
    if (updatedRun.error) {
      return NextResponse.json({ error: updatedRun.error.message }, { status: 500 })
    }

    await recalculateRunTotals(admin, id, ctx.businessId)
    await admin.from("payroll_run_events").insert({
      business_id: ctx.businessId,
      run_id: id,
      actor_user_id: ctx.userId,
      event_type: "run.updated",
      data: {
        previousRevision: Number(runRow.revision ?? 1),
        peopleCount: people.length,
      },
    })
    const run = await loadRun(admin, ctx.businessId, id)
    return NextResponse.json({ run })
  }

  if (
    body.payPeriodStart !== undefined ||
    body.payPeriodEnd !== undefined ||
    body.payday !== undefined ||
    body.name !== undefined ||
    body.note !== undefined
  ) {
    const metadata = (runRow.metadata as Record<string, unknown>) ?? {}
    await admin
      .from("payroll_runs")
      .update({
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

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requirePayrollAccess(request, ["preparer", "approver"])
  if (!ctx.ok) return ctx.response

  const { id } = await params
  const body = (await request.json().catch(() => ({}))) as { action?: string; reason?: string }
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
    let activeLines = ((current.payroll_lines as Array<Record<string, unknown>>) ?? []).filter(
      (line) => line.status !== "skipped",
    )
    const linePersonIds = [
      ...new Set(activeLines.map((line) => String(line.person_id || "")).filter(Boolean)),
    ]
    if (linePersonIds.length) {
      const { data: currentPeople } = await admin
        .from("payroll_people")
        .select("*")
        .eq("business_id", ctx.businessId)
        .in("id", linePersonIds)
      const refreshed = await buildPayrollLines(
        admin,
        id,
        (currentPeople ?? []).map((person) => mapRowToPayrollPerson(person as PayrollPersonRow)),
      )
      const refreshedByPerson = new Map(
        refreshed.map((line) => [String(line.person_id), line]),
      )
      for (const existing of activeLines) {
        const replacement = refreshedByPerson.get(String(existing.person_id || ""))
        if (!replacement) continue
        await admin
          .from("payroll_lines")
          .update({
            recipient_snapshot: replacement.recipient_snapshot,
            rail: replacement.rail,
            payment_method_id: replacement.payment_method_id,
            payment_method_snapshot: replacement.payment_method_snapshot,
            metadata: {
              ...((existing.metadata as Record<string, unknown> | null) ?? {}),
              ...replacement.metadata,
            },
            status: "pending",
            lock_id: null,
            error_code: null,
            error_message: null,
            updated_at: new Date().toISOString(),
          })
          .eq("id", existing.id)
          .eq("run_id", id)
      }
      activeLines = activeLines.map((existing) => {
        const replacement = refreshedByPerson.get(String(existing.person_id || ""))
        return replacement
          ? {
              ...existing,
              recipient_snapshot: replacement.recipient_snapshot,
              rail: replacement.rail,
              payment_method_id: replacement.payment_method_id,
              payment_method_snapshot: replacement.payment_method_snapshot,
              status: "pending",
            }
          : existing
      })
    }
    const invalid = activeLines.filter(
      (line) =>
        Number(line.amount_cents ?? 0) <= 0 ||
        !String(line.rail ?? "").trim() ||
        (line.rail === "easetag" &&
          !String((line.recipient_snapshot as Record<string, unknown>)?.easetag ?? "").trim()) ||
        (line.rail !== "easetag" && !(line.recipient_snapshot as Record<string, unknown>)?.recipientId),
    )
    if (activeLines.length === 0 || invalid.length > 0) {
      return NextResponse.json(
        {
          error: "Resolve all amount and receiving-method issues before submitting.",
          issues: invalid.map((line) => ({ lineId: line.id, code: "not_ready" })),
        },
        { status: 400 },
      )
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
    const { data: current, error: currentError } = await admin
      .from("payroll_runs")
      .select("status,revision")
      .eq("id", id)
      .eq("business_id", ctx.businessId)
      .maybeSingle()
    if (currentError) return NextResponse.json({ error: currentError.message }, { status: 500 })
    if (!current || !["pending_approval", "needs_reapproval"].includes(String(current.status))) {
      return NextResponse.json({ error: "Only a run awaiting approval can be returned to draft." }, { status: 409 })
    }
    const { data, error } = await admin
      .from("payroll_runs")
      .update({
        status: "draft",
        submitted_at: null,
        submitted_by: null,
        approval_snapshot: null,
        revision: Number(current.revision ?? 1) + 1,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .eq("business_id", ctx.businessId)
      .eq("status", current.status)
      .select("id")
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    if (!data?.length) return NextResponse.json({ error: "Run cannot be withdrawn" }, { status: 409 })
    await admin
      .from("business_approvals")
      .update({ status: "rejected" })
      .eq("subject_type", "payroll_run")
      .eq("subject_id", id)
      .eq("status", "open")
    await admin.from("payroll_run_events").insert({
      business_id: ctx.businessId,
      run_id: id,
      actor_user_id: ctx.userId,
      event_type: "run.withdrawn",
      data: {},
    })
    return NextResponse.json({ run: await loadRun(admin, ctx.businessId, id) })
  }

  if (action === "reject") {
    if (ctx.payrollRole !== "approver") {
      return NextResponse.json({ error: "Only a Payroll approver can reject this run." }, { status: 403 })
    }
    const reason = body.reason?.trim()
    if (!reason) return NextResponse.json({ error: "A reason is required." }, { status: 400 })
    const { data: current, error: currentError } = await admin
      .from("payroll_runs")
      .select("status,revision,metadata")
      .eq("id", id)
      .eq("business_id", ctx.businessId)
      .maybeSingle()
    if (currentError) return NextResponse.json({ error: currentError.message }, { status: 500 })
    if (!current || !["pending_approval", "needs_reapproval"].includes(String(current.status))) {
      return NextResponse.json({ error: "Only a run awaiting approval can be rejected." }, { status: 409 })
    }
    const { data, error } = await admin
      .from("payroll_runs")
      .update({
        status: "draft",
        submitted_at: null,
        submitted_by: null,
        approval_snapshot: null,
        revision: Number(current.revision ?? 1) + 1,
        metadata: {
          ...((current.metadata as Record<string, unknown> | null) ?? {}),
          rejectionReason: reason,
        },
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .eq("business_id", ctx.businessId)
      .eq("status", current.status)
      .select("id")
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    if (!data?.length) return NextResponse.json({ error: "Run cannot be rejected." }, { status: 409 })
    await admin
      .from("business_approvals")
      .update({ status: "rejected" })
      .eq("subject_type", "payroll_run")
      .eq("subject_id", id)
      .eq("status", "open")
    await admin.from("payroll_run_events").insert({
      business_id: ctx.businessId,
      run_id: id,
      actor_user_id: ctx.userId,
      event_type: "run.rejected",
      data: { reason },
    })
    return NextResponse.json({ run: await loadRun(admin, ctx.businessId, id) })
  }

  if (action === "cancel") {
    if (ctx.payrollRole !== "approver") {
      return NextResponse.json({ error: "Only a Payroll approver can cancel a schedule." }, { status: 403 })
    }
    const { data } = await admin
      .from("payroll_runs")
      .update({
        status: "cancelled",
        fx_snapshot: {},
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .eq("business_id", ctx.businessId)
      .eq("status", "scheduled")
      .select("id")
    if (!data?.length)
      return NextResponse.json({ error: "Only a scheduled payroll can be cancelled." }, { status: 409 })
    await admin
      .from("payroll_lines")
      .update({
        status: "pending",
        lock_id: null,
        updated_at: new Date().toISOString(),
      })
      .eq("run_id", id)
      .in("status", ["locked", "quoting"])
    await admin.from("payroll_run_events").insert({
      business_id: ctx.businessId,
      run_id: id,
      actor_user_id: ctx.userId,
      event_type: "run.cancelled",
      data: {},
    })
    return NextResponse.json({ run: await loadRun(admin, ctx.businessId, id) })
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 })
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requirePayrollAccess(request, ["preparer", "approver"])
  if (!ctx.ok) return ctx.response

  const { id } = await params
  const admin = createSupabaseAdmin()
  const { data: run } = await admin
    .from("payroll_runs")
    .select("status")
    .eq("id", id)
    .eq("business_id", ctx.businessId)
    .maybeSingle()
  if (!run) return NextResponse.json({ error: "Not found" }, { status: 404 })
  if (!canDeletePayrollRun(run.status)) {
    return NextResponse.json(
      { error: "Only draft or failed payroll runs can be deleted. Payroll history must be retained." },
      { status: 409 },
    )
  }

  if (run.status === "failed") {
    const { count, error: paidLineError } = await admin
      .from("payroll_lines")
      .select("id", { count: "exact", head: true })
      .eq("run_id", id)
      .eq("status", "paid")
    if (paidLineError) {
      return NextResponse.json({ error: paidLineError.message }, { status: 500 })
    }
    if ((count ?? 0) > 0) {
      return NextResponse.json(
        { error: "This failed run includes completed payments and must be retained." },
        { status: 409 },
      )
    }
  }

  await admin
    .from("business_approvals")
    .delete()
    .eq("business_id", ctx.businessId)
    .eq("subject_type", "payroll_run")
    .eq("subject_id", id)

  const { data: deleted, error } = await admin
    .from("payroll_runs")
    .delete()
    .eq("id", id)
    .eq("business_id", ctx.businessId)
    .in("status", [...DELETABLE_PAYROLL_RUN_STATUSES])
    .select("id")
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!deleted?.length) {
    return NextResponse.json({ error: "This payroll run changed and can no longer be deleted." }, { status: 409 })
  }
  return NextResponse.json({ ok: true })
}
