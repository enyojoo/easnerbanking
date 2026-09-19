import { NextResponse } from "next/server"
import { requireAuth } from "@/app/api/noah/_helpers"
import { createSupabaseAdmin } from "@/lib/supabase/admin"
import { sendPayrollConnectionResponseEmails } from "@/lib/payroll/personal-payroll"

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth(request)
  if ("error" in auth) return auth.error
  const { id } = await params
  const admin = createSupabaseAdmin()
  const { data: invitation } = await admin.from("payroll_connection_invitations")
    .select("*").eq("id", id).maybeSingle()
  if (!invitation) return NextResponse.json({ error: "Invitation not found" }, { status: 404 })
  if (String(invitation.email).toLowerCase() !== String(auth.user.email ?? "").toLowerCase()) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }
  if (invitation.status !== "pending") {
    return NextResponse.json({ error: "Invitation is no longer available" }, { status: 409 })
  }
  const now = new Date().toISOString()
  const claimed = await admin.from("payroll_connection_invitations").update({
    status: "declined", consumed_at: now,
  }).eq("id", id).eq("status", "pending").select("id")
  if (claimed.error || !claimed.data?.length) {
    return NextResponse.json({ error: "Invitation is no longer available" }, { status: 409 })
  }
  await admin.from("payroll_connections").update({
    status: "declined", declined_at: now, shared_identity: {}, updated_at: now,
  }).eq("id", invitation.connection_id)
  await admin.from("payroll_people").update({
    connection_status: "declined", readiness_status: "consent_declined", updated_at: now,
  }).eq("id", invitation.person_id)
  await admin.from("payroll_run_events").insert({
    business_id: invitation.business_id, person_id: invitation.person_id,
    actor_user_id: auth.user.id, event_type: "connection.declined", data: { invitationId: id },
  })
  const [{ data: business }, { data: person }] = await Promise.all([
    admin.from("businesses").select("name").eq("id", invitation.business_id).maybeSingle(),
    admin.from("payroll_people").select("full_name").eq("id", invitation.person_id).maybeSingle(),
  ])
  await sendPayrollConnectionResponseEmails({
    admin,
    businessId: String(invitation.business_id),
    employeeEmail: String(invitation.email),
    businessName: String(business?.name || "Easner Business"),
    recipientName: String(person?.full_name || "Payroll recipient"),
    outcome: "declined",
  })
  return NextResponse.json({ ok: true })
}
