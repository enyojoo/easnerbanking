import { NextResponse } from "next/server"
import { createSupabaseAdmin } from "@/lib/supabase/admin"
import { requireOfficeAdmin } from "@/lib/api/admin-auth"
import { logAdminAction } from "@/lib/admin-audit"
import {
  applyAccountRestriction,
  liftAccountRestriction,
  resolveAccountRestriction,
} from "@/lib/account-restriction"

type Body = { reason?: string | null; mode?: "wind_down" | "closed" }

export async function POST(
  request: Request,
  { params }: { params: Promise<{ businessId: string }> },
) {
  const auth = await requireOfficeAdmin(request)
  if (!auth.ok) return auth.response
  const { businessId } = await params
  if (!businessId) return NextResponse.json({ error: "Missing business id" }, { status: 400 })

  const body = (await request.json().catch(() => ({}))) as Body
  const admin = createSupabaseAdmin()
  const { data: biz } = await admin.from("businesses").select("id").eq("id", businessId).maybeSingle()
  if (!biz) return NextResponse.json({ error: "Business not found" }, { status: 404 })

  const mode = body.mode === "closed" ? "closed" : "wind_down"
  const result = await applyAccountRestriction(admin, {
    subjectKind: "business",
    businessId,
    source: "office",
    reason:
      body.reason?.trim() ||
      (mode === "closed" ? "Office account closed" : "Office compliance restriction"),
    createdByAdminId: auth.ctx.userId,
    mode,
  })

  await logAdminAction(auth.ctx.userId, "account.restriction_apply", businessId, {
    subjectKind: "business",
    applied: result.applied,
  })

  const restriction = await resolveAccountRestriction(admin, { businessId })
  return NextResponse.json({ ok: true, applied: result.applied, restriction })
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ businessId: string }> },
) {
  const auth = await requireOfficeAdmin(request)
  if (!auth.ok) return auth.response
  const { businessId } = await params
  if (!businessId) return NextResponse.json({ error: "Missing business id" }, { status: 400 })

  const admin = createSupabaseAdmin()
  const lifted = await liftAccountRestriction(admin, { businessId })
  if (lifted.blocked) {
    return NextResponse.json(
      { error: lifted.error ?? "This restriction cannot be lifted from Office." },
      { status: 403 },
    )
  }
  await logAdminAction(auth.ctx.userId, "account.restriction_lift", businessId, lifted)
  return NextResponse.json({ ok: true, ...lifted })
}
