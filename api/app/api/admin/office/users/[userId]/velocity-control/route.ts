import { NextResponse } from "next/server"
import { createSupabaseAdmin } from "@/lib/supabase/admin"
import { requireOfficeAdmin } from "@/lib/api/admin-auth"
import { logAdminAction } from "@/lib/admin-audit"
import { liftVelocityControl } from "@/lib/wallet-send-compliance"

async function businessIdForUser(userId: string) {
  const admin = createSupabaseAdmin()
  const { data } = await admin
    .from("users")
    .select("easner_business_id")
    .eq("id", userId)
    .maybeSingle()
  return data?.easner_business_id ? String(data.easner_business_id) : null
}

export async function DELETE(request: Request, { params }: { params: Promise<{ userId: string }> }) {
  const auth = await requireOfficeAdmin(request)
  if (!auth.ok) return auth.response
  const { userId } = await params
  const businessId = await businessIdForUser(userId)
  if (!businessId) {
    return NextResponse.json({ error: "User has no business" }, { status: 400 })
  }
  const admin = createSupabaseAdmin()
  const lifted = await liftVelocityControl(admin, businessId, auth.ctx.userId)
  await logAdminAction(auth.ctx.userId, "wallet_send.velocity_lift", userId, { businessId, ...lifted })
  return NextResponse.json({ ok: true, ...lifted })
}
