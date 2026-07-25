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

  const runs = (data ?? []).map((r) => mapRowToPayrollRun(r as PayrollRunRow))
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
  const sourceCurrency = String(body.sourceCurrency || "USD").toUpperCase()

  const completeDraft = Array.isArray(body.lines)
  let personIds = completeDraft ? body.lines!.map((line) => line.personId) : body.personIds ?? []
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
  if (completeDraft) {
    const invalidPeople = people.filter((person) =>
      person.status !== "active" ||
      person.readinessStatus !== "ready" ||
      person.payCurrency !== sourceCurrency
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
    if (!body.name?.trim() || !body.payPeriodStart || !body.payPeriodEnd || !body.payday || !body.sourceAccountId) {
      return NextResponse.json({ error: "Complete the payroll details before saving." }, { status: 400 })
    }
  }

  const { data: runRow, error: runErr } = await admin
    .from("payroll_runs")
    .insert({
      business_id: ctx.businessId,
      status: "draft",
      scheduled_for: body.scheduledFor ?? body.payday ?? new Date().toISOString().slice(0, 10),
      ...(completeDraft ? {
        schedule_id: body.scheduleId || null,
        pay_period_start: body.payPeriodStart,
        pay_period_end: body.payPeriodEnd,
        payday: body.payday,
        source_account_id: body.sourceAccountId,
      } : {}),
      source_currency: sourceCurrency,
      drafted_by: ctx.userId,
      metadata: { offCycle: Boolean(body.offCycle), name: body.name?.trim() || "Payroll run" },
      updated_at: new Date().toISOString(),
    })
    .select("*")
    .single()

  if (runErr) return NextResponse.json({ error: runErr.message }, { status: 500 })

  const linePayloads = await buildPayrollLines(admin, String(runRow.id), people)
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
    data: { peopleCount: people.length, sourceAccountId: body.sourceAccountId ?? null },
  })
  return NextResponse.json({ run }, { status: 201 })
}
