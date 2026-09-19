import { NextResponse } from "next/server"
import { createSupabaseAdmin } from "@/lib/supabase/admin"
import { requireOfficeAdmin } from "@/lib/api/admin-auth"
import { logAdminAction } from "@/lib/admin-audit"

type Body = { enabled?: boolean }

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ businessId: string }> },
) {
  const auth = await requireOfficeAdmin(request)
  if (!auth.ok) return auth.response
  const { businessId } = await params
  if (!businessId) return NextResponse.json({ error: "Missing business id" }, { status: 400 })

  const body = (await request.json().catch(() => ({}))) as Body
  if (typeof body.enabled !== "boolean") {
    return NextResponse.json({ error: "enabled must be a boolean" }, { status: 400 })
  }

  const admin = createSupabaseAdmin()
  const { data: biz, error: lookupError } = await admin
    .from("businesses")
    .select("id,dev_platform_enabled")
    .eq("id", businessId)
    .maybeSingle()
  if (lookupError) {
    return NextResponse.json({ error: lookupError.message }, { status: 500 })
  }
  if (!biz) return NextResponse.json({ error: "Business not found" }, { status: 404 })

  const { data, error } = await admin
    .from("businesses")
    .update({ dev_platform_enabled: body.enabled })
    .eq("id", businessId)
    .select("id,dev_platform_enabled")
    .maybeSingle()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  await logAdminAction(auth.ctx.userId, "business.dev_platform_enabled", businessId, {
    enabled: body.enabled,
    previous: Boolean((biz as { dev_platform_enabled?: boolean }).dev_platform_enabled),
  })

  return NextResponse.json({
    ok: true,
    businessId,
    enabled: Boolean(data?.dev_platform_enabled),
  })
}
