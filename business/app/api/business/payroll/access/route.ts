import { NextResponse } from "next/server"
import { requirePayrollAccess, type PayrollAccessRole } from "@/lib/payroll/require-payroll-access"
import { createSupabaseAdmin } from "@/lib/supabase/admin"

export async function GET(request: Request) {
  const ctx = await requirePayrollAccess(request, ["approver"])
  if (!ctx.ok) return ctx.response
  const { data, error } = await createSupabaseAdmin()
    .from("payroll_access_assignments")
    .select("id,user_id,role,created_at,updated_at")
    .eq("business_id", ctx.businessId)
    .order("created_at")
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const userIds = (data ?? []).map((assignment) => String(assignment.user_id))
  const { data: users } = userIds.length
    ? await createSupabaseAdmin().from("users").select("id,full_name,email,avatar_url").in("id", userIds)
    : { data: [] }
  const userById = new Map((users ?? []).map((user) => [String(user.id), user]))
  return NextResponse.json({ assignments: (data ?? []).map((assignment) => ({
    ...assignment,
    user: userById.get(String(assignment.user_id)) ?? null,
  })) })
}

export async function PUT(request: Request) {
  const ctx = await requirePayrollAccess(request, ["approver"])
  if (!ctx.ok) return ctx.response
  const body = (await request.json().catch(() => ({}))) as {
    userId?: string
    role?: PayrollAccessRole
  }
  if (!body.userId || !body.role || !["viewer", "preparer", "approver"].includes(body.role)) {
    return NextResponse.json({ error: "A valid user and Payroll role are required." }, { status: 400 })
  }
  const admin = createSupabaseAdmin()
  const { data: membership } = await admin.from("business_memberships")
    .select("id,status")
    .eq("business_id", ctx.businessId)
    .eq("user_id", body.userId)
    .eq("status", "active")
    .maybeSingle()
  if (!membership) {
    return NextResponse.json({ error: "The user is not an active business member." }, { status: 400 })
  }
  const { data, error } = await admin.from("payroll_access_assignments").upsert({
    business_id: ctx.businessId,
    user_id: body.userId,
    role: body.role,
    updated_at: new Date().toISOString(),
  }, { onConflict: "business_id,user_id" }).select("*").single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  await admin.from("payroll_run_events").insert({
    business_id: ctx.businessId,
    actor_user_id: ctx.userId,
    event_type: "access.assignment_changed",
    data: { userId: body.userId, role: body.role },
  })
  return NextResponse.json({ assignment: data })
}

export async function DELETE(request: Request) {
  const ctx = await requirePayrollAccess(request, ["approver"])
  if (!ctx.ok) return ctx.response
  const userId = new URL(request.url).searchParams.get("userId")
  if (!userId || userId === ctx.userId) {
    return NextResponse.json({ error: "Select another assigned user." }, { status: 400 })
  }
  const admin = createSupabaseAdmin()
  await admin.from("payroll_access_assignments")
    .delete().eq("business_id", ctx.businessId).eq("user_id", userId)
  await admin.from("payroll_run_events").insert({
    business_id: ctx.businessId,
    actor_user_id: ctx.userId,
    event_type: "access.assignment_removed",
    data: { userId },
  })
  return NextResponse.json({ ok: true })
}
