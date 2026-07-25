import { NextResponse } from "next/server"
import { requireBusinessRole } from "@/lib/b2b/require-role"
import { createSupabaseAdmin } from "@/lib/supabase/admin"

export async function GET(request: Request) {
  const ctx = await requireBusinessRole(request, ["Owner", "Admin", "Member", "Viewer"])
  if (!ctx.ok) return ctx.response
  const { data, error } = await createSupabaseAdmin().from("payroll_settings")
    .select("*").eq("business_id", ctx.businessId).maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({
    settings: {
      requireSeparateApprover: Boolean(data?.require_separate_approver),
      timezone: String(data?.timezone || "UTC"),
      defaultSourceAccountId: data?.default_source_account_id ? String(data.default_source_account_id) : null,
      defaultCurrency: String(data?.default_currency || "USD"),
      defaultPaydayTime: String(data?.default_payday_time || "09:00"),
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
  const timezone = body.timezone?.trim()
  if (timezone) {
    try {
      new Intl.DateTimeFormat("en", { timeZone: timezone }).format()
    } catch {
      return NextResponse.json({ error: "Invalid IANA timezone." }, { status: 400 })
    }
  }
  const admin = createSupabaseAdmin()
  const { data, error } = await admin.from("payroll_settings").upsert({
    business_id: ctx.businessId,
    ...(typeof body.requireSeparateApprover === "boolean"
      ? { require_separate_approver: body.requireSeparateApprover }
      : {}),
    ...(timezone ? { timezone } : {}),
    ...(body.defaultSourceAccountId !== undefined ? { default_source_account_id: body.defaultSourceAccountId || null } : {}),
    ...(body.defaultCurrency ? { default_currency: body.defaultCurrency.toUpperCase() } : {}),
    ...(body.defaultPaydayTime ? { default_payday_time: body.defaultPaydayTime } : {}),
    updated_at: new Date().toISOString(),
  }, { onConflict: "business_id" }).select("*").single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  await admin.from("payroll_run_events").insert({
    business_id: ctx.businessId,
    actor_user_id: ctx.userId,
    event_type: "settings.changed",
    data: {
      requireSeparateApprover: body.requireSeparateApprover,
      timezone: timezone ?? undefined,
      defaultSourceAccountId: body.defaultSourceAccountId,
      defaultCurrency: body.defaultCurrency,
      defaultPaydayTime: body.defaultPaydayTime,
    },
  })
  return NextResponse.json({ settings: {
    requireSeparateApprover: Boolean(data.require_separate_approver),
    timezone: String(data.timezone || "UTC"),
    defaultSourceAccountId: data.default_source_account_id ? String(data.default_source_account_id) : null,
    defaultCurrency: String(data.default_currency || "USD"),
    defaultPaydayTime: String(data.default_payday_time || "09:00"),
  } })
}
