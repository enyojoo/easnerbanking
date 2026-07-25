import { NextResponse } from "next/server"
import { requirePayrollAccess } from "@/lib/payroll/require-payroll-access"
import { createSupabaseAdmin } from "@/lib/supabase/admin"
import {
  mapRowToPayrollSchedule,
  nextPayrollRunDate,
  type PayrollScheduleRow,
} from "@/lib/payroll/map-payroll"
import type { PayrollScheduleFrequency } from "@/lib/payroll/types"
import { resolvePayrollSourceDefaults } from "@/lib/payroll/source-account"

export async function GET(request: Request) {
  const ctx = await requirePayrollAccess(request, ["viewer", "preparer", "approver"])
  if (!ctx.ok) return ctx.response

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
  const { data, error } = await admin
    .from("payroll_schedules")
    .select("*")
    .eq("business_id", ctx.businessId)
    .order("created_at", { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const scheduleIds = (data ?? []).map((row) => String(row.id))
  const { data: memberships } = scheduleIds.length
    ? await admin.from("payroll_schedule_people").select("schedule_id,person_id").in("schedule_id", scheduleIds)
    : { data: [] }
  const peopleBySchedule = new Map<string, string[]>()
  for (const membership of memberships ?? []) {
    const id = String(membership.schedule_id)
    peopleBySchedule.set(id, [...(peopleBySchedule.get(id) ?? []), String(membership.person_id)])
  }
  const schedules = (data ?? []).map((r) => ({
    ...mapRowToPayrollSchedule(r as PayrollScheduleRow),
    personIds: peopleBySchedule.get(String(r.id)) ?? [],
  }))
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
    sourceAccountId?: string
    fundingReminderDays?: number
    personIds?: string[]
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
        timezone: body.timezone || payrollDefaults.timezone,
        draftLeadDays: Math.max(0, Number(body.draftLeadDays ?? 5)),
        approvalLeadDays: Math.max(0, Number(body.approvalLeadDays ?? 2)),
        weekendPolicy: body.weekendPolicy || "previous_business_day",
        sourceCurrency: payrollDefaults.currency,
        sourceAccountId: payrollDefaults.sourceAccountId,
        fundingReminderDays: Math.max(0, Number(body.fundingReminderDays ?? 3)),
      },
      updated_at: new Date().toISOString(),
    })
    .select("*")
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (body.personIds?.length) {
    const { data: validPeople } = await admin.from("payroll_people").select("id")
      .eq("business_id", ctx.businessId).in("id", [...new Set(body.personIds)])
    await admin.from("payroll_schedule_people").insert((validPeople ?? []).map((person) => ({
      schedule_id: data.id,
      person_id: person.id,
      business_id: ctx.businessId,
    })))
  }
  return NextResponse.json({
    schedule: { ...mapRowToPayrollSchedule(data as PayrollScheduleRow), personIds: body.personIds ?? [] },
  })
}
