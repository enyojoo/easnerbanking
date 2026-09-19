import { NextResponse } from "next/server"
import { requireAuth } from "@/app/api/noah/_helpers"
import { createSupabaseAdmin } from "@/lib/supabase/admin"
import { sendPayrollConnectionResponseEmails, verifiedPayrollIdentity } from "@/lib/payroll/personal-payroll"
import { syncPayrollPersonReceivingMethod } from "@/lib/payroll/sync-person-receiving-method"

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth(request)
  if ("error" in auth) return auth.error
  const { id } = await params
  const body = (await request.json().catch(() => ({}))) as { preferredMethodId?: string }
  const admin = createSupabaseAdmin()
  const { data: invitation } = await admin.from("payroll_connection_invitations")
    .select("*,payroll_connections(*),payroll_people(*)")
    .eq("id", id)
    .maybeSingle()
  if (!invitation) return NextResponse.json({ error: "Invitation not found" }, { status: 404 })
  if (String(invitation.email).toLowerCase() !== String(auth.user.email ?? "").toLowerCase()) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }
  if (invitation.status !== "pending" || new Date(invitation.expires_at).getTime() <= Date.now()) {
    return NextResponse.json({ error: "Invitation is no longer available" }, { status: 409 })
  }

  const { data: methods } = await admin.from("payroll_payment_methods")
    .select("id")
    .eq("connection_id", invitation.connection_id)
    .eq("status", "active")
  const methodIds = (methods ?? []).map((method) => String(method.id))
  const connection = invitation.payroll_connections as Record<string, unknown>
  const preferredMethodId = body.preferredMethodId || String(connection.preferred_method_id || "")
  if (!methodIds.includes(preferredMethodId)) {
    return NextResponse.json({ error: "Select a valid receiving method" }, { status: 400 })
  }

  const identity = await verifiedPayrollIdentity(admin, auth.user)
  if (identity.verificationState !== "approved" || !identity.easetag || !identity.legalName) {
    return NextResponse.json({
      error: "Complete EASETAG identity verification before approving this payroll connection.",
    }, { status: 409 })
  }
  const now = new Date().toISOString()
  const claimed = await admin.from("payroll_connection_invitations").update({
    status: "approved", consumed_at: now,
  }).eq("id", id).eq("status", "pending").select("id")
  if (claimed.error || !claimed.data?.length) {
    return NextResponse.json({ error: "Invitation is no longer available" }, { status: 409 })
  }
  await admin.from("payroll_connections").update({
    user_id: auth.user.id,
    status: "approved",
    preferred_method_id: preferredMethodId,
    shared_identity: identity,
    approved_at: now,
    declined_at: null,
    revoked_at: null,
    updated_at: now,
  }).eq("id", invitation.connection_id)
  await admin.from("payroll_people").update({
    connection_id: invitation.connection_id,
    connection_status: "approved",
    readiness_status: "pending_method_sync",
    full_name: identity.legalName || (invitation.payroll_people as Record<string, unknown>)?.full_name,
    country: identity.residenceCountry,
    easetag: identity.easetag,
    identity_snapshot: identity,
    updated_at: now,
  }).eq("id", invitation.person_id)
  await syncPayrollPersonReceivingMethod(admin, String(invitation.connection_id))
  await admin.from("payroll_run_events").insert({
    business_id: invitation.business_id,
    person_id: invitation.person_id,
    actor_user_id: auth.user.id,
    event_type: "connection.approved",
    data: { invitationId: id, preferredMethodId },
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
    recipientName: String(person?.full_name || identity.legalName || "Payroll recipient"),
    outcome: "approved",
  })
  const { data: readiness } = await admin.from("payroll_people")
    .select("readiness_status").eq("id", invitation.person_id).maybeSingle()
  return NextResponse.json({
    ok: true,
    connectionId: invitation.connection_id,
    readinessStatus: readiness?.readiness_status ?? "method_verification_required",
  })
}
