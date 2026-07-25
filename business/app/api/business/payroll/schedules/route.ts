import { NextResponse } from "next/server"
import { requireBusinessOrgWithRole, requireBusinessRole } from "@/lib/b2b/require-role"
import { createSupabaseAdmin } from "@/lib/supabase/admin"
import {
  mapRowToPayrollSchedule,
  nextPayrollRunDate,
  type PayrollScheduleRow,
} from "@/lib/payroll/map-payroll"
import type { PayrollScheduleFrequency } from "@/lib/payroll/types"

export async function GET(request: Request) {
  const ctx = await requireBusinessOrgWithRole(request)
  if (!ctx.ok) return ctx.response

  const admin = createSupabaseAdmin()
  const { data, error } = await admin
    .from("payroll_schedules")
    .select("*")
    .eq("business_id", ctx.businessId)
    .order("created_at", { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const schedules = (data ?? []).map((r) => mapRowToPayrollSchedule(r as PayrollScheduleRow))
  return NextResponse.json({ schedules })
}

export async function POST(request: Request) {
  const ctx = await requireBusinessRole(request, ["Owner", "Admin"])
  if (!ctx.ok) return ctx.response

  const body = (await request.json().catch(() => ({}))) as {
    name?: string
    frequency?: PayrollScheduleFrequency
    nextRunAt?: string
    active?: boolean
  }

  const frequency = body.frequency ?? "monthly"
  const nextRunAt = body.nextRunAt ?? new Date().toISOString().slice(0, 10)

  const admin = createSupabaseAdmin()
  const { data, error } = await admin
    .from("payroll_schedules")
    .insert({
      business_id: ctx.businessId,
      name: body.name?.trim() || "Payroll schedule",
      frequency,
      next_run_at: nextRunAt,
      active: body.active ?? true,
      template: {},
      updated_at: new Date().toISOString(),
    })
    .select("*")
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ schedule: mapRowToPayrollSchedule(data as PayrollScheduleRow) })
}
