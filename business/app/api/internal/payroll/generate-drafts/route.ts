import { NextResponse } from "next/server"
import { assertInternalCronAuthorized } from "@/lib/api/internal-auth"
import { createSupabaseAdmin } from "@/lib/supabase/admin"
import {
  mapRowToPayrollPerson,
  nextPayrollRunDate,
  type PayrollPersonRow,
  type PayrollScheduleRow,
} from "@/lib/payroll/map-payroll"
import { buildPayrollLines } from "@/lib/payroll/build-lines"
import type { PayrollScheduleFrequency } from "@/lib/payroll/types"

function addUtcDays(date: Date, days: number): Date {
  const result = new Date(date)
  result.setUTCDate(result.getUTCDate() + days)
  return result
}

function dateOnly(date: Date): string {
  return date.toISOString().slice(0, 10)
}

function adjustedPayday(
  payday: Date,
  policy: "previous_business_day" | "next_business_day",
): Date {
  const adjusted = new Date(payday)
  const day = adjusted.getUTCDay()
  if (day === 6) adjusted.setUTCDate(adjusted.getUTCDate() + (policy === "next_business_day" ? 2 : -1))
  if (day === 0) adjusted.setUTCDate(adjusted.getUTCDate() + (policy === "next_business_day" ? 1 : -2))
  return adjusted
}

function payPeriodFor(frequency: PayrollScheduleFrequency, payday: Date) {
  const end = new Date(payday)
  let start = new Date(payday)
  if (frequency === "weekly") start = addUtcDays(end, -6)
  else if (frequency === "biweekly") start = addUtcDays(end, -13)
  else if (frequency === "semimonthly") {
    start.setUTCDate(end.getUTCDate() <= 15 ? 1 : 16)
  } else {
    start.setUTCDate(1)
  }
  return { start: dateOnly(start), end: dateOnly(end) }
}

export async function GET(request: Request) {
  try {
    assertInternalCronAuthorized(request)
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const admin = createSupabaseAdmin()
  const today = new Date().toISOString().slice(0, 10)

  const { data: schedules, error } = await admin
    .from("payroll_schedules")
    .select("*")
    .eq("active", true)
    .limit(100)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  let created = 0
  for (const sched of schedules ?? []) {
    const schedule = sched as PayrollScheduleRow
    const businessId = schedule.business_id
    const template = (schedule.template as Record<string, unknown> | null) ?? {}
    const nominalPayday = new Date(`${schedule.next_run_at}T12:00:00.000Z`)
    const draftLeadDays = Math.max(0, Number(template.draftLeadDays ?? 5))
    if (today < dateOnly(addUtcDays(nominalPayday, -draftLeadDays))) continue
    const weekendPolicy = template.weekendPolicy === "next_business_day"
      ? "next_business_day"
      : "previous_business_day"
    const payday = adjustedPayday(nominalPayday, weekendPolicy)
    const period = payPeriodFor(schedule.frequency as PayrollScheduleFrequency, nominalPayday)

    const { data: existingRun } = await admin.from("payroll_runs")
      .select("id")
      .eq("schedule_id", schedule.id)
      .eq("payday", dateOnly(payday))
      .maybeSingle()
    if (existingRun) {
      const next = nextPayrollRunDate(
        schedule.frequency as PayrollScheduleFrequency,
        nominalPayday,
      )
      await admin.from("payroll_schedules")
        .update({ next_run_at: next, updated_at: new Date().toISOString() })
        .eq("id", schedule.id)
      continue
    }

    const { data: peopleRows } = await admin
      .from("payroll_people")
      .select("*")
      .eq("business_id", businessId)
      .eq("status", "active")

    const includedPersonIds = Array.isArray(template.includedPersonIds)
      ? new Set(template.includedPersonIds.map(String))
      : null
    const includedPeople = includedPersonIds
      ? (peopleRows ?? []).filter((person) => includedPersonIds.has(String(person.id)))
      : peopleRows
    if (!includedPeople?.length) continue

    const { data: runRow, error: runErr } = await admin
      .from("payroll_runs")
      .insert({
        business_id: businessId,
        status: "draft",
        schedule_id: schedule.id,
        scheduled_for: dateOnly(payday),
        payday: dateOnly(payday),
        pay_period_start: period.start,
        pay_period_end: period.end,
        source_currency: String(template.sourceCurrency || "USD").toUpperCase(),
        metadata: {
          scheduleId: schedule.id,
          scheduleName: schedule.name,
          autoDraft: true,
          timezone: String(template.timezone || "UTC"),
          approvalLeadDays: Number(template.approvalLeadDays ?? 2),
        },
        updated_at: new Date().toISOString(),
      })
      .select("*")
      .single()

    if (runErr) continue

    const people = includedPeople.map((r) => mapRowToPayrollPerson(r as PayrollPersonRow))
    const lines = await buildPayrollLines(admin, String(runRow.id), people)
    await admin.from("payroll_lines").insert(lines)

    const next = nextPayrollRunDate(
      schedule.frequency as PayrollScheduleFrequency,
      new Date(schedule.next_run_at),
    )
    await admin
      .from("payroll_schedules")
      .update({ next_run_at: next, updated_at: new Date().toISOString() })
      .eq("id", schedule.id)

    created++
  }

  return NextResponse.json({ created })
}
