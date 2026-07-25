import { NextResponse } from "next/server"
import { requireBusinessRole } from "@/lib/b2b/require-role"
import { createSupabaseAdmin } from "@/lib/supabase/admin"

export async function PATCH(request: Request) {
  const ctx = await requireBusinessRole(request, ["Owner", "Admin"])
  if (!ctx.ok) return ctx.response
  const body = (await request.json().catch(() => ({}))) as {
    enabled?: boolean
    requireSeparateApprover?: boolean
    timezone?: string
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
    ...(typeof body.enabled === "boolean" ? { enabled: body.enabled } : {}),
    ...(typeof body.requireSeparateApprover === "boolean"
      ? { require_separate_approver: body.requireSeparateApprover }
      : {}),
    ...(timezone ? { timezone } : {}),
    updated_at: new Date().toISOString(),
  }, { onConflict: "business_id" }).select("*").single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  await admin.from("payroll_run_events").insert({
    business_id: ctx.businessId,
    actor_user_id: ctx.userId,
    event_type: "settings.changed",
    data: {
      enabled: body.enabled,
      requireSeparateApprover: body.requireSeparateApprover,
      timezone: timezone ?? undefined,
    },
  })
  return NextResponse.json({ settings: data })
}
