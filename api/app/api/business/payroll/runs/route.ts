import { NextResponse } from "next/server"
import { requirePayrollAccess } from "@/lib/payroll/require-payroll-access"
import { createSupabaseAdmin } from "@/lib/supabase/admin"
import {
  mapRowToPayrollRun,
  mapRowToPayrollLine,
  mapRowToPayrollPerson,
  type PayrollRunRow,
  type PayrollLineRow,
  type PayrollPersonRow,
  amountToCents,
} from "@/lib/payroll/map-payroll"
import { recalculateRunTotals } from "@/lib/payroll/run-utils"
import { buildPayrollLines } from "@/lib/payroll/build-lines"
import type { PayrollRunDraftInput } from "@/lib/payroll/types"
import { resolvePayrollSourceDefaults } from "@/lib/payroll/source-account"
import { payrollScheduleOccurrence } from "@/lib/payroll/schedule-preview"

export async function GET(request: Request) {
  const ctx = await requirePayrollAccess(request, ["viewer", "preparer", "approver"])
  if (!ctx.ok) return ctx.response

  const admin = createSupabaseAdmin()
  const { data, error } = await admin
    .from("payroll_runs")
    .select("*")
    .eq("business_id", ctx.businessId)
    .order("created_at", { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const runIds = (data ?? []).map((row) => String(row.id))
  const [
    { data: lineRows, error: lineRowsError },
    { data: documentRows, error: documentRowsError },
  ] = runIds.length
    ? await Promise.all([
        admin.from("payroll_lines").select("run_id,status").in("run_id", runIds),
        admin
          .from("payroll_documents")
          .select("run_id")
          .in("run_id", runIds)
          .eq("type", "pay_stub"),
      ])
    : [{ data: [], error: null }, { data: [], error: null }]
  if (lineRowsError) return NextResponse.json({ error: lineRowsError.message }, { status: 500 })
  if (documentRowsError) return NextResponse.json({ error: documentRowsError.message }, { status: 500 })
  const peopleCountByRun = new Map<string, number>()
  const lineStatusCountsByRun = new Map<string, Record<string, number>>()
  for (const line of lineRows ?? []) {
    const runId = String(line.run_id)
    peopleCountByRun.set(runId, (peopleCountByRun.get(runId) ?? 0) + 1)
    const counts = lineStatusCountsByRun.get(runId) ?? {
      pending: 0,
      quoting: 0,
      locked: 0,
      processing: 0,
      paid: 0,
      failed: 0,
      skipped: 0,
    }
    const status = String(line.status || "pending")
    counts[status] = (counts[status] ?? 0) + 1
    lineStatusCountsByRun.set(runId, counts)
  }
  const runs = (data ?? []).map((row) => ({
    ...mapRowToPayrollRun(row as PayrollRunRow),
    peopleCount: peopleCountByRun.get(String(row.id)) ?? 0,
    lineStatusCounts: lineStatusCountsByRun.get(String(row.id)) ?? {
      pending: 0,
      quoting: 0,
      locked: 0,
      processing: 0,
      paid: 0,
      failed: 0,
      skipped: 0,
    },
    hasPayStubs: (documentRows ?? []).some(
      (document) => String(document.run_id) === String(row.id),
    ),
  }))
  return NextResponse.json({ runs })
}

export async function POST(request: Request) {
  const ctx = await requirePayrollAccess(request, ["preparer", "approver"])
  if (!ctx.ok) return ctx.response

  const body = (await request.json().catch(() => ({}))) as Partial<PayrollRunDraftInput> & {
    personIds?: string[]
    scheduledFor?: string
  }

  const admin = createSupabaseAdmin()
  let payrollDefaults
  try {
    payrollDefaults = await resolvePayrollSourceDefaults(admin, ctx.businessId)
  } catch (cause) {
    return NextResponse.json(
      { error: cause instanceof Error ? cause.message : "Could not load Payroll account settings." },
      { status: 500 },
    )
  }
  const sourceCurrency = payrollDefaults.currency

  const completeDraft = Array.isArray(body.lines)
  const creationMode =
    body.creationMode === "duplicate" || body.creationMode === "correction"
      ? body.creationMode
      : "new"
  let sourceRun:
    | {
        id: string
        status: string
        pay_period_start: string | null
        pay_period_end: string | null
        payday: string | null
      }
    | null = null
  if (creationMode !== "new") {
    const sourceRunId = String(body.sourceRunId || "").trim()
    if (!sourceRunId) {
      return NextResponse.json({ error: "Choose the payroll run to copy." }, { status: 400 })
    }
    const { data } = await admin
      .from("payroll_runs")
      .select("id,status,pay_period_start,pay_period_end,payday")
      .eq("id", sourceRunId)
      .eq("business_id", ctx.businessId)
      .maybeSingle()
    if (!data) return NextResponse.json({ error: "The source payroll run is unavailable." }, { status: 404 })
    sourceRun = {
      id: String(data.id),
      status: String(data.status),
      pay_period_start: data.pay_period_start ? String(data.pay_period_start) : null,
      pay_period_end: data.pay_period_end ? String(data.pay_period_end) : null,
      payday: data.payday ? String(data.payday) : null,
    }
  }
  let personIds = completeDraft ? body.lines!.map((line) => line.personId) : body.personIds ?? []
  if (creationMode === "correction" && sourceRun) {
    if (!["partial", "failed"].includes(sourceRun.status)) {
      return NextResponse.json(
        { error: "Only a partial or failed payroll can create a corrected run." },
        { status: 409 },
      )
    }
    const { data: sourceLines } = await admin
      .from("payroll_lines")
      .select("person_id,status")
      .eq("run_id", sourceRun.id)
    const hasPaidLine = (sourceLines ?? []).some((line) => line.status === "paid")
    const failedPersonIds = new Set(
      (sourceLines ?? [])
        .filter((line) => line.status === "failed" && line.person_id)
        .map((line) => String(line.person_id)),
    )
    if (!hasPaidLine || failedPersonIds.size === 0) {
      return NextResponse.json(
        { error: "This payroll does not have both successful and failed payments to correct." },
        { status: 409 },
      )
    }
    if (personIds.length === 0 || personIds.some((personId) => !failedPersonIds.has(personId))) {
      return NextResponse.json(
        { error: "A corrected run can include only failed payments from the original run." },
        { status: 400 },
      )
    }
  }
  if (personIds.length === 0) {
    const { data: activePeople } = await admin
      .from("payroll_people")
      .select("id")
      .eq("business_id", ctx.businessId)
      .eq("status", "active")
    personIds = (activePeople ?? []).map((p) => String(p.id))
  }

  if (personIds.length === 0) {
    return NextResponse.json({ error: "No active people to pay" }, { status: 400 })
  }

  const { data: peopleRows } = await admin
    .from("payroll_people")
    .select("*")
    .eq("business_id", ctx.businessId)
    .in("id", personIds)

  const people = (peopleRows ?? []).map((r) => mapRowToPayrollPerson(r as PayrollPersonRow))
  if (people.length !== new Set(personIds).size) {
    return NextResponse.json({ error: "One or more selected people are not available." }, { status: 400 })
  }
  let scheduleName: string | null = null
  let effectivePayPeriodStart = body.payPeriodStart
  let effectivePayPeriodEnd = body.payPeriodEnd
  let effectivePayday = body.payday
  if (creationMode === "correction" && sourceRun) {
    effectivePayPeriodStart = sourceRun.pay_period_start ?? undefined
    effectivePayPeriodEnd = sourceRun.pay_period_end ?? undefined
    effectivePayday = sourceRun.payday ?? undefined
  }
  if (completeDraft && body.scheduleId && creationMode !== "correction") {
    const { data: schedule, error: scheduleError } = await admin
      .from("payroll_schedules")
      .select("id,name,frequency,next_run_at,template,active")
      .eq("id", body.scheduleId)
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
  if (completeDraft) {
    const invalidPeople = people.filter((person) =>
      person.status !== "active" ||
      person.readinessStatus !== "ready"
    )
    const invalidLines = body.lines!.filter((line) => !Number.isFinite(Number(line.amount)) || Number(line.amount) <= 0)
    if (invalidPeople.length || invalidLines.length) {
      return NextResponse.json({
        error: "Resolve all amount and receiving-method issues before saving this run.",
        issues: [
          ...invalidPeople.map((person) => ({ personId: person.id, code: "person_not_ready" })),
          ...invalidLines.map((line) => ({ personId: line.personId, code: "invalid_amount" })),
        ],
      }, { status: 400 })
    }
    if (!body.name?.trim() || !effectivePayPeriodStart || !effectivePayPeriodEnd || !effectivePayday) {
      return NextResponse.json({ error: "Complete the payroll details before saving." }, { status: 400 })
    }
  }

  const { data: runRow, error: runErr } = await admin
    .from("payroll_runs")
    .insert({
      business_id: ctx.businessId,
      status: "draft",
      scheduled_for: body.scheduledFor ?? effectivePayday ?? new Date().toISOString().slice(0, 10),
      ...(completeDraft ? {
        schedule_id: creationMode === "correction" ? null : body.scheduleId || null,
        pay_period_start: effectivePayPeriodStart,
        pay_period_end: effectivePayPeriodEnd,
        payday: effectivePayday,
        source_account_id: payrollDefaults.sourceAccountId,
      } : {}),
      source_currency: sourceCurrency,
      drafted_by: ctx.userId,
      metadata: {
        offCycle: Boolean(body.offCycle),
        name: body.name?.trim() || "Payroll run",
        ...(scheduleName ? { scheduleName } : {}),
        ...(creationMode === "duplicate" && sourceRun
          ? { copiedFromRunId: sourceRun.id }
          : {}),
        ...(creationMode === "correction" && sourceRun
          ? { correctionOfRunId: sourceRun.id }
          : {}),
      },
      updated_at: new Date().toISOString(),
    })
    .select("*")
    .single()

  if (runErr) {
    if (runErr.code === "23505" && body.scheduleId) {
      return NextResponse.json(
        { error: "A payroll run already exists for this schedule’s next payday." },
        { status: 409 },
      )
    }
    return NextResponse.json({ error: runErr.message }, { status: 500 })
  }

  const linePayloads = await buildPayrollLines(admin, String(runRow.id), people)
  for (const line of linePayloads) line.pay_currency = sourceCurrency
  if (completeDraft) {
    const amountByPerson = new Map(body.lines!.map((line) => [line.personId, Number(line.amount)]))
    for (const line of linePayloads) {
      const amount = amountByPerson.get(String(line.person_id)) ?? 0
      line.amount_cents = amountToCents(amount)
      line.source_amount_cents = amountToCents(amount)
    }
  }
  const { error: linesErr } = await admin.from("payroll_lines").insert(linePayloads)
  if (linesErr) {
    await admin.from("payroll_runs").delete().eq("id", runRow.id).eq("business_id", ctx.businessId)
    return NextResponse.json({ error: linesErr.message }, { status: 500 })
  }

  await recalculateRunTotals(admin, String(runRow.id), ctx.businessId)

  const { data: lines } = await admin
    .from("payroll_lines")
    .select("*")
    .eq("run_id", runRow.id)

  const run = mapRowToPayrollRun(
    runRow as PayrollRunRow,
    (lines ?? []).map((l) => mapRowToPayrollLine(l as PayrollLineRow)),
  )

  await admin.from("payroll_run_events").insert({
    business_id: ctx.businessId,
    run_id: runRow.id,
    actor_user_id: ctx.userId,
    event_type: "run.created",
    data: { peopleCount: people.length, sourceAccountId: payrollDefaults.sourceAccountId },
  })
  return NextResponse.json({ run }, { status: 201 })
}
