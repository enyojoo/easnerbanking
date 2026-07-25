import { NextResponse } from "next/server"
import { requirePayrollAccess } from "@/lib/payroll/require-payroll-access"
import { createSupabaseAdmin } from "@/lib/supabase/admin"
import {
  mapRowToPayrollSchedule,
  nextPayrollRunDate,
  type PayrollScheduleRow,
} from "@/lib/payroll/map-payroll"
import type { PayrollScheduleFrequency } from "@/lib/payroll/types"

export async function GET(request: Request) {
  const ctx = await requirePayrollAccess(request, ["viewer", "preparer", "approver"])
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
  const ctx = await requirePayrollAccess(request, ["preparer", "approver"])
  if (!ctx.ok) return ctx.response

  const body = (await request.json().catch(() => ({}))) as {
    name?: string
    frequency?: PayrollScheduleFrequency
    nextRunAt?: string
    active?: boolean
    timezone?: string
    draftLeadDays?: number
    approvalLeadDays?: number
    weekendPolicy?: "previous_business_day" | "next_business_day"
    sourceCurrency?: string
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
      template: {
        timezone: body.timezone || "UTC",
        draftLeadDays: Math.max(0, Number(body.draftLeadDays ?? 5)),
        approvalLeadDays: Math.max(0, Number(body.approvalLeadDays ?? 2)),
        weekendPolicy: body.weekendPolicy || "previous_business_day",
        sourceCurrency: String(body.sourceCurrency || "USD").toUpperCase(),
      },
      updated_at: new Date().toISOString(),
    })
    .select("*")
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ schedule: mapRowToPayrollSchedule(data as PayrollScheduleRow) })
}
