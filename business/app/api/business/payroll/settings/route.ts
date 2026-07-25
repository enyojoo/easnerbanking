import { NextResponse } from "next/server"
import { requireBusinessRole } from "@/lib/b2b/require-role"
import { createSupabaseAdmin } from "@/lib/supabase/admin"
import {
  isPayrollSourceAccountId,
  payrollCurrencyFromSourceAccountId,
  resolvePayrollSourceDefaults,
} from "@/lib/payroll/source-account"

export async function GET(request: Request) {
  const ctx = await requireBusinessRole(request, ["Owner", "Admin", "Member", "Viewer"])
  if (!ctx.ok) return ctx.response
  const admin = createSupabaseAdmin()
  const { data, error } = await admin.from("payroll_settings")
    .select("*").eq("business_id", ctx.businessId).maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  let defaults
  try {
    defaults = await resolvePayrollSourceDefaults(admin, ctx.businessId)
  } catch (cause) {
    return NextResponse.json(
      { error: cause instanceof Error ? cause.message : "Could not load Payroll settings." },
      { status: 500 },
    )
  }
  return NextResponse.json({
    settings: {
      requireSeparateApprover: Boolean(data?.require_separate_approver),
      timezone: defaults.timezone,
      defaultSourceAccountId: defaults.sourceAccountId,
      defaultCurrency: defaults.currency,
      defaultPaydayTime: defaults.paydayTime,
    },
  })
}

export async function PATCH(request: Request) {
  const ctx = await requireBusinessRole(request, ["Owner", "Admin"])
  if (!ctx.ok) return ctx.response
  const body = (await request.json().catch(() => ({}))) as {
    requireSeparateApprover?: boolean
    timezone?: string
    defaultSourceAccountId?: string | null
    defaultCurrency?: string
    defaultPaydayTime?: string
  }
  const admin = createSupabaseAdmin()
  let current
  try {
    current = await resolvePayrollSourceDefaults(admin, ctx.businessId)
  } catch (cause) {
    return NextResponse.json(
      { error: cause instanceof Error ? cause.message : "Could not load Payroll settings." },
      { status: 500 },
    )
  }
  const timezone = body.timezone?.trim() || current.timezone
  if (timezone) {
    try {
      new Intl.DateTimeFormat("en", { timeZone: timezone }).format()
    } catch {
      return NextResponse.json({ error: "Invalid IANA timezone." }, { status: 400 })
    }
  }
  const sourceAccountId = body.defaultSourceAccountId === undefined
    ? current.sourceAccountId
    : String(body.defaultSourceAccountId || "")
  if (!isPayrollSourceAccountId(sourceAccountId)) {
    return NextResponse.json(
      { error: "Choose an available USD or EUR Payroll account." },
      { status: 400 },
    )
  }
  const currency = payrollCurrencyFromSourceAccountId(sourceAccountId)
  const paydayTime = body.defaultPaydayTime || current.paydayTime
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(paydayTime)) {
    return NextResponse.json({ error: "Choose a valid payday time." }, { status: 400 })
  }
  const { data, error } = await admin.from("payroll_settings").upsert({
    business_id: ctx.businessId,
    ...(typeof body.requireSeparateApprover === "boolean"
      ? { require_separate_approver: body.requireSeparateApprover }
      : {}),
    timezone,
    default_source_account_id: sourceAccountId,
    // Retained for backward compatibility. The source account is authoritative.
    default_currency: currency,
    default_payday_time: paydayTime,
    updated_at: new Date().toISOString(),
  }, { onConflict: "business_id" }).select("*").single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await admin.from("payroll_people").update({
    pay_currency: currency,
    updated_at: new Date().toISOString(),
  }).eq("business_id", ctx.businessId)
  const { data: draftRuns } = await admin.from("payroll_runs")
    .select("id")
    .eq("business_id", ctx.businessId)
    .eq("status", "draft")
  const draftRunIds = (draftRuns ?? []).map((run) => String(run.id))
  if (draftRunIds.length) {
    await admin.from("payroll_runs").update({
      source_account_id: sourceAccountId,
      source_currency: currency,
      updated_at: new Date().toISOString(),
    }).in("id", draftRunIds).eq("business_id", ctx.businessId)
    await admin.from("payroll_lines").update({
      pay_currency: currency,
      updated_at: new Date().toISOString(),
    }).in("run_id", draftRunIds)
  }
  await admin.from("payroll_run_events").insert({
    business_id: ctx.businessId,
    actor_user_id: ctx.userId,
    event_type: "settings.changed",
    data: {
      requireSeparateApprover: body.requireSeparateApprover,
      timezone,
      defaultSourceAccountId: sourceAccountId,
      payrollCurrency: currency,
      defaultPaydayTime: paydayTime,
      affectedDraftRuns: draftRunIds,
    },
  })
  return NextResponse.json({ settings: {
    requireSeparateApprover: Boolean(data.require_separate_approver),
    timezone: String(data.timezone || timezone),
    defaultSourceAccountId: String(data.default_source_account_id || sourceAccountId),
    defaultCurrency: payrollCurrencyFromSourceAccountId(String(data.default_source_account_id || sourceAccountId)),
    defaultPaydayTime: String(data.default_payday_time || paydayTime),
  } })
}
