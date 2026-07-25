import { NextResponse } from "next/server"
import { assertInternalCronAuthorized } from "@/lib/api/internal-auth"
import { createSupabaseAdmin } from "@/lib/supabase/admin"
import {
  mapRowToPayrollPerson,
  nextPayrollRunDate,
  type PayrollPersonRow,
  type PayrollScheduleRow,
} from "@/lib/payroll/map-payroll"
import { buildLineFromPerson } from "@/lib/payroll/run-utils"
import type { PayrollScheduleFrequency } from "@/lib/payroll/types"

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
    .lte("next_run_at", today)
    .limit(100)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  let created = 0
  for (const sched of schedules ?? []) {
    const schedule = sched as PayrollScheduleRow
    const businessId = schedule.business_id

    const { data: peopleRows } = await admin
      .from("payroll_people")
      .select("*")
      .eq("business_id", businessId)
      .eq("status", "active")

    if (!peopleRows?.length) continue

    const { data: runRow, error: runErr } = await admin
      .from("payroll_runs")
      .insert({
        business_id: businessId,
        status: "draft",
        scheduled_for: schedule.next_run_at,
        source_currency: "USD",
        metadata: { scheduleId: schedule.id, autoDraft: true },
        updated_at: new Date().toISOString(),
      })
      .select("*")
      .single()

    if (runErr) continue

    const people = peopleRows.map((r) => mapRowToPayrollPerson(r as PayrollPersonRow))
    const lines = people.map((p) => buildLineFromPerson(String(runRow.id), p))
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
