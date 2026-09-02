import { NextResponse } from "next/server"
import { createSupabaseAdmin } from "@/lib/supabase/admin"
import { requireOfficeAdmin } from "@/lib/api/admin-auth"
import { logAdminAction } from "@/lib/admin-audit"
import { liftVelocityControl } from "@/lib/wallet-send-compliance"

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ businessId: string }> },
) {
  const auth = await requireOfficeAdmin(request)
  if (!auth.ok) return auth.response
  const { businessId } = await params
  if (!businessId) return NextResponse.json({ error: "Missing business id" }, { status: 400 })
  const admin = createSupabaseAdmin()
  const lifted = await liftVelocityControl(admin, businessId, auth.ctx.userId)
  await logAdminAction(auth.ctx.userId, "wallet_send.velocity_lift", businessId, lifted)
  return NextResponse.json({ ok: true, ...lifted })
}
