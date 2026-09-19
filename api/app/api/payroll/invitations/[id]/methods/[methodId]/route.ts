import { NextResponse } from "next/server"
import { requireAuth } from "@/app/api/noah/_helpers"
import { createSupabaseAdmin } from "@/lib/supabase/admin"

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string; methodId: string }> },
) {
  const auth = await requireAuth(request)
  if ("error" in auth) return auth.error
  const { id, methodId } = await params
  const admin = createSupabaseAdmin()

  const { data: invitation } = await admin
    .from("payroll_connection_invitations")
    .select("connection_id,email,status,expires_at")
    .eq("id", id)
    .maybeSingle()
  const ownsInvitation =
    invitation
    && invitation.status === "pending"
    && new Date(invitation.expires_at).getTime() > Date.now()
    && String(invitation.email).toLowerCase() === String(auth.user.email ?? "").toLowerCase()
  if (!ownsInvitation) {
    return NextResponse.json({ error: "Invitation not found" }, { status: 404 })
  }

  const { data: method } = await admin
    .from("payroll_payment_methods")
    .select("id,type")
    .eq("id", methodId)
    .eq("connection_id", invitation.connection_id)
    .eq("owner_type", "employee")
    .eq("status", "active")
    .maybeSingle()
  if (!method || method.type === "easetag") {
    return NextResponse.json(
      { error: "This receiving method cannot be deleted" },
      { status: 400 },
    )
  }

  const { error } = await admin
    .from("payroll_payment_methods")
    .update({ status: "deleted", updated_at: new Date().toISOString() })
    .eq("id", methodId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
