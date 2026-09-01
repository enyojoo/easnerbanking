import { NextResponse } from "next/server"
import { createSupabaseAdmin } from "@/lib/supabase/admin"
import { requireOfficeAdmin } from "@/lib/api/admin-auth"
import { logAdminAction } from "@/lib/admin-audit"
import {
  applyAccountRestriction,
  liftAccountRestriction,
  resolveAccountRestriction,
  resolveRestrictionSubject,
} from "@/lib/account-restriction"

type Body = { reason?: string | null }

export async function POST(request: Request, { params }: { params: Promise<{ userId: string }> }) {
  const auth = await requireOfficeAdmin(request)
  if (!auth.ok) return auth.response

  const { userId: targetUserId } = await params
  if (!targetUserId) {
    return NextResponse.json({ error: "Missing user id" }, { status: 400 })
  }

  const body = (await request.json().catch(() => ({}))) as Body
  const admin = createSupabaseAdmin()

  const { data: userRow, error: userErr } = await admin
    .from("users")
    .select("id,role,easner_business_id,email,full_name")
    .eq("id", targetUserId)
    .maybeSingle()

  if (userErr) return NextResponse.json({ error: userErr.message }, { status: 500 })
  if (!userRow) return NextResponse.json({ error: "User not found" }, { status: 404 })

  const subject = resolveRestrictionSubject({
    userId: targetUserId,
    role: userRow.role as string | null | undefined,
    easnerBusinessId: userRow.easner_business_id as string | null | undefined,
  })

  const result = await applyAccountRestriction(admin, {
    subjectKind: subject.subjectKind,
    userId: subject.userId,
    businessId: subject.businessId,
    source: "office",
    reason: body.reason?.trim() || "Office compliance restriction",
    createdByAdminId: auth.ctx.userId,
  })

  await logAdminAction(auth.ctx.userId, "account.restriction_apply", targetUserId, {
    subjectKind: subject.subjectKind,
    businessId: subject.businessId,
    applied: result.applied,
  })

  const restriction = await resolveAccountRestriction(admin, {
    userId: targetUserId,
    role: userRow.role as string | null | undefined,
    easnerBusinessId: userRow.easner_business_id as string | null | undefined,
  })

  return NextResponse.json({ ok: true, applied: result.applied, restriction })
}

export async function DELETE(request: Request, { params }: { params: Promise<{ userId: string }> }) {
  const auth = await requireOfficeAdmin(request)
  if (!auth.ok) return auth.response

  const { userId: targetUserId } = await params
  if (!targetUserId) {
    return NextResponse.json({ error: "Missing user id" }, { status: 400 })
  }

  const admin = createSupabaseAdmin()
  const { data: userRow } = await admin
    .from("users")
    .select("id,role,easner_business_id")
    .eq("id", targetUserId)
    .maybeSingle()

  if (!userRow) return NextResponse.json({ error: "User not found" }, { status: 404 })

  const lifted = await liftAccountRestriction(admin, {
    userId: targetUserId,
    role: userRow.role as string | null | undefined,
    easnerBusinessId: userRow.easner_business_id as string | null | undefined,
  })

  await logAdminAction(auth.ctx.userId, "account.restriction_lift", targetUserId, lifted)

  return NextResponse.json({ ok: true, ...lifted })
}
