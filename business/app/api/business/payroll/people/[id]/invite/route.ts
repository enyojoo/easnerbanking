import { NextResponse } from "next/server"
import { requirePayrollAccess } from "@/lib/payroll/require-payroll-access"
import { createSupabaseAdmin } from "@/lib/supabase/admin"
import { emailService } from "@easner/server"
import { mapRowToPayrollPerson, type PayrollPersonRow } from "@/lib/payroll/map-payroll"
import {
  createPayrollInvitationToken,
  payrollApprovalUrl,
} from "@/lib/payroll/invitations"
import { sendTransactionSettledPush } from "@/lib/notifications/expo-push"
import { enforcePayrollRateLimit } from "@/lib/payroll/rate-limit"

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctx = await requirePayrollAccess(request, ["preparer", "approver"])
  if (!ctx.ok) return ctx.response

  const { id } = await params
  const admin = createSupabaseAdmin()
  if (!(await enforcePayrollRateLimit(admin, `payroll_invite:${ctx.businessId}:${id}`, {
    limit: 10,
    windowSeconds: 3600,
  }))) {
    return NextResponse.json({ error: "Too many invitations. Try again later." }, { status: 429 })
  }

  const { data: personRow } = await admin
    .from("payroll_people")
    .select("*")
    .eq("id", id)
    .eq("business_id", ctx.businessId)
    .maybeSingle()

  if (!personRow) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const person = mapRowToPayrollPerson(personRow as PayrollPersonRow)
  if (!person.email?.trim()) {
    return NextResponse.json({ error: "Person has no email address" }, { status: 400 })
  }

  const { data: biz } = await admin
    .from("businesses")
    .select("name,easetag")
    .eq("id", ctx.businessId)
    .maybeSingle()

  const businessName = String(biz?.name || "Your employer")
  if (!person.easetag?.trim()) {
    return NextResponse.json({ error: "An EASETAG is required for a payroll connection." }, { status: 400 })
  }

  const existing = await admin.from("payroll_connections")
    .select("id,status")
    .eq("business_id", ctx.businessId)
    .eq("person_id", id)
    .maybeSingle()

  let connectionId = existing.data?.id ? String(existing.data.id) : ""
  if (!connectionId) {
    const inserted = await admin.from("payroll_connections").insert({
      business_id: ctx.businessId,
      person_id: id,
      status: "pending",
    }).select("id").single()
    if (inserted.error) return NextResponse.json({ error: inserted.error.message }, { status: 500 })
    connectionId = String(inserted.data.id)
  } else {
    await admin.from("payroll_connections").update({
      status: "pending",
      declined_at: null,
      revoked_at: null,
      updated_at: new Date().toISOString(),
    }).eq("id", connectionId)
  }

  await admin.from("payroll_connection_invitations").update({
    status: "invalidated",
  }).eq("connection_id", connectionId).eq("status", "pending")

  const invitationToken = createPayrollInvitationToken()
  const invitation = await admin.from("payroll_connection_invitations").insert({
    connection_id: connectionId,
    business_id: ctx.businessId,
    person_id: id,
    email: person.email.trim().toLowerCase(),
    token_hash: invitationToken.tokenHash,
    expires_at: invitationToken.expiresAt,
    created_by: ctx.userId,
  }).select("id").single()
  if (invitation.error) return NextResponse.json({ error: invitation.error.message }, { status: 500 })

  const existingMethod = await admin.from("payroll_payment_methods")
    .select("id")
    .eq("connection_id", connectionId)
    .eq("type", "easetag")
    .eq("status", "active")
    .maybeSingle()
  let methodId = existingMethod.data?.id ? String(existingMethod.data.id) : ""
  if (!methodId) {
    const method = await admin.from("payroll_payment_methods").insert({
      connection_id: connectionId,
      person_id: id,
      business_id: ctx.businessId,
      owner_type: "employee",
      type: "easetag",
      label: `@${person.easetag.replace(/^@/, "")}`,
    }).select("id").single()
    if (method.error) return NextResponse.json({ error: method.error.message }, { status: 500 })
    methodId = String(method.data.id)
  }
  await admin.from("payroll_connections").update({ preferred_method_id: methodId }).eq("id", connectionId)
  await admin.from("payroll_people").update({
    connection_id: connectionId,
    connection_status: "pending",
    readiness_status: "pending_consent",
  }).eq("id", id)

  const approvalUrl = payrollApprovalUrl(invitationToken.token)

  try {
    await emailService.sendEmail({
      to: person.email.trim(),
      template: "payrollEasetagInvite",
      audience: "personal",
      data: {
        recipientName: person.fullName,
        businessName,
        signupUrl: approvalUrl,
      },
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to send invite"
    return NextResponse.json({ error: msg }, { status: 500 })
  }

  const { data: invitedUser } = await admin.from("users")
    .select("id").ilike("email", person.email.trim()).maybeSingle()
  if (invitedUser?.id) {
    await sendTransactionSettledPush(admin, {
      userId: String(invitedUser.id),
      transactionId: String(invitation.data.id),
      title: "Payroll connection request",
      body: `${businessName} wants to add you to payroll.`,
      data: {
        type: "payroll_connection_request",
        payrollInvitationId: invitation.data.id,
      },
    }).catch(() => undefined)
  }

  await admin.from("payroll_run_events").insert({
    business_id: ctx.businessId,
    person_id: id,
    actor_user_id: ctx.userId,
    event_type: existing.data ? "connection.invitation_resent" : "connection.invited",
    data: { invitationId: invitation.data.id, expiresAt: invitationToken.expiresAt },
  })

  return NextResponse.json({
    ok: true,
    invitation: {
      id: invitation.data.id,
      status: "pending",
      expiresAt: invitationToken.expiresAt,
    },
  })
}
