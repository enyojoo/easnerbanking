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
} from "@/lib/payroll/map-payroll"
import { recalculateRunTotals } from "@/lib/payroll/run-utils"
import { buildPayrollLines } from "@/lib/payroll/build-lines"

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

  const body = (await request.json().catch(() => ({}))) as {
    personIds?: string[]
    sourceCurrency?: string
    scheduledFor?: string
    offCycle?: boolean
  }

  const admin = createSupabaseAdmin()
  const sourceCurrency = String(body.sourceCurrency || "USD").toUpperCase()

  let personIds = body.personIds ?? []
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

  const { data: runRow, error: runErr } = await admin
    .from("payroll_runs")
    .insert({
      business_id: ctx.businessId,
      status: "draft",
      scheduled_for: body.scheduledFor ?? new Date().toISOString().slice(0, 10),
      source_currency: sourceCurrency,
      drafted_by: ctx.userId,
      metadata: { offCycle: Boolean(body.offCycle) },
      updated_at: new Date().toISOString(),
    })
    .select("*")
    .single()

  if (runErr) return NextResponse.json({ error: runErr.message }, { status: 500 })

  const linePayloads = await buildPayrollLines(admin, String(runRow.id), people)
  const { error: linesErr } = await admin.from("payroll_lines").insert(linePayloads)
  if (linesErr) return NextResponse.json({ error: linesErr.message }, { status: 500 })

  await recalculateRunTotals(admin, String(runRow.id), ctx.businessId)

  const { data: lines } = await admin
    .from("payroll_lines")
    .select("*")
    .eq("run_id", runRow.id)

  const run = mapRowToPayrollRun(
    runRow as PayrollRunRow,
    (lines ?? []).map((l) => mapRowToPayrollLine(l as PayrollLineRow)),
  )

  return NextResponse.json({ run })
}
