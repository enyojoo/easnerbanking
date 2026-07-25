import { NextResponse } from "next/server"
import { requirePayrollAccess } from "@/lib/payroll/require-payroll-access"
import { createSupabaseAdmin } from "@/lib/supabase/admin"
import { mapRowToPayrollSchedule, type PayrollScheduleRow } from "@/lib/payroll/map-payroll"
import type { PayrollScheduleFrequency } from "@/lib/payroll/types"
import { resolvePayrollSourceDefaults } from "@/lib/payroll/source-account"

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctx = await requirePayrollAccess(request, ["preparer", "approver"])
  if (!ctx.ok) return ctx.response

  const { id } = await params
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
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (body.name != null) patch.name = body.name.trim()
  if (body.frequency != null) patch.frequency = body.frequency
  if (body.nextRunAt != null) patch.next_run_at = body.nextRunAt
  if (body.active != null) patch.active = body.active
  const { data: existing } = await admin.from("payroll_schedules")
    .select("template").eq("id", id).eq("business_id", ctx.businessId).maybeSingle()
  patch.template = {
    ...((existing?.template as Record<string, unknown>) ?? {}),
    ...(body.timezone != null ? { timezone: body.timezone } : {}),
    ...(body.draftLeadDays != null ? { draftLeadDays: Math.max(0, Number(body.draftLeadDays)) } : {}),
    ...(body.approvalLeadDays != null ? { approvalLeadDays: Math.max(0, Number(body.approvalLeadDays)) } : {}),
    ...(body.weekendPolicy != null ? { weekendPolicy: body.weekendPolicy } : {}),
    sourceCurrency: payrollDefaults.currency,
    sourceAccountId: payrollDefaults.sourceAccountId,
    ...(body.fundingReminderDays != null ? { fundingReminderDays: Math.max(0, Number(body.fundingReminderDays)) } : {}),
  }

  const { data, error } = await admin
    .from("payroll_schedules")
    .update(patch)
    .eq("id", id)
    .eq("business_id", ctx.businessId)
    .select("*")
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (body.personIds) {
    const unique = [...new Set(body.personIds)]
    const { data: validPeople } = unique.length
      ? await admin.from("payroll_people").select("id").eq("business_id", ctx.businessId).in("id", unique)
      : { data: [] }
    await admin.from("payroll_schedule_people").delete().eq("schedule_id", id).eq("business_id", ctx.businessId)
    if (validPeople?.length) {
      await admin.from("payroll_schedule_people").insert(validPeople.map((person) => ({
        schedule_id: id,
        person_id: person.id,
        business_id: ctx.businessId,
      })))
    }
  }
  return NextResponse.json({
    schedule: { ...mapRowToPayrollSchedule(data as PayrollScheduleRow), personIds: body.personIds },
  })
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctx = await requirePayrollAccess(request, ["preparer", "approver"])
  if (!ctx.ok) return ctx.response

  const { id } = await params
  const admin = createSupabaseAdmin()
  const { error } = await admin
    .from("payroll_schedules")
    .delete()
    .eq("id", id)
    .eq("business_id", ctx.businessId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
