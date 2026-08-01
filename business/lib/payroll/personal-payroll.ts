import type { SupabaseClient, User } from "@supabase/supabase-js"
import { isBusinessTier1Complete } from "@/lib/compliance/business-tier1"
import { hashPayrollInvitationToken } from "./invitations"
import { maskPayrollMethodDetails } from "./payment-method-security"
import { payrollDetailsForReceivingMethodForm } from "./payment-method-destination"

export const PAYROLL_SHARED_IDENTITY_FIELDS = [
  "Legal name",
  "Residence country",
  "Profile photo",
  "EASETAG",
  "Verification status and date",
] as const

export function maskPayrollMethod(
  method: Record<string, unknown>,
): Record<string, string> {
  const type = String(method.type || "")
  if (!["bank", "mobile_money", "stablecoin"].includes(type)) {
    return method.label ? { easetag: String(method.label) } : {}
  }
  return maskPayrollMethodDetails(
    type as "bank" | "mobile_money" | "stablecoin",
    payrollMethodDetails(method),
  )
}

export function payrollMethodDetails(
  method: Record<string, unknown>,
): Record<string, string> {
  return payrollDetailsForReceivingMethodForm(
    Object.fromEntries(
      Object.entries(method).map(([key, value]) => [
        key,
        value == null ? "" : String(value),
      ]),
    ),
  )
}

export async function resolvePayrollInvitation(
  admin: SupabaseClient,
  user: User,
  token: string,
) {
  const tokenHash = hashPayrollInvitationToken(token)
  const { data: invitation } = await admin
    .from("payroll_connection_invitations")
    .select("*, payroll_connections(*), payroll_people(*), businesses(name,easetag,logo_url,verification_status,noah_kyb_status)")
    .eq("token_hash", tokenHash)
    .maybeSingle()

  if (!invitation) return { error: "This payroll invitation is invalid.", status: 404 } as const
  if (String(invitation.email).toLowerCase() !== String(user.email ?? "").toLowerCase()) {
    return { error: "Sign in with the email address that received this invitation.", status: 403 } as const
  }
  if (invitation.status !== "pending") {
    return { error: `This invitation is ${invitation.status}.`, status: 409 } as const
  }
  if (new Date(invitation.expires_at).getTime() <= Date.now()) {
    await admin.from("payroll_connection_invitations").update({ status: "expired" }).eq("id", invitation.id)
    await admin.from("payroll_connections").update({ status: "expired" }).eq("id", invitation.connection_id)
    return { error: "This payroll invitation has expired. Ask the business to resend it.", status: 410 } as const
  }

  const { data: methods } = await admin.from("payroll_payment_methods")
    .select("id,type,label,owner_type,status,full_name,country_code,currency,account_number,bank_name,phone_number,email,mobile_provider,wallet_network,routing_number,sort_code,iban,swift_bic,transfer_type,checking_or_savings,address_line1,city,state,postal_code,metadata")
    .eq("connection_id", invitation.connection_id)
    .eq("status", "active")
  const connection = invitation.payroll_connections as Record<string, unknown>
  const person = invitation.payroll_people as Record<string, unknown>
  const business = invitation.businesses as Record<string, unknown>

  return {
    invitation: {
      id: String(invitation.id),
      connectionId: String(invitation.connection_id),
      businessId: String(invitation.business_id),
      businessName: String(business?.name || "Easner Business"),
      businessEasetag: business?.easetag ? String(business.easetag) : null,
      businessLogoUrl: business?.logo_url ? String(business.logo_url) : null,
      businessVerified: isBusinessTier1Complete(business as Record<string, unknown>),
      personName: String(person?.full_name || "Payroll recipient"),
      status: String(connection?.status || "pending"),
      expiresAt: String(invitation.expires_at),
      sharedFields: [...PAYROLL_SHARED_IDENTITY_FIELDS],
      methods: (methods ?? []).map((method) => ({
        id: String(method.id),
        type: String(method.type),
        label: String(method.label),
        details: payrollMethodDetails(method as Record<string, unknown>),
        preferred: String(connection?.preferred_method_id || "") === String(method.id),
        ownerType: String(method.owner_type),
        status: String(method.status),
      })),
    },
  } as const
}

export async function verifiedPayrollIdentity(admin: SupabaseClient, user: User) {
  const { data } = await admin.from("users")
    .select("id,full_name,residence_country,avatar_url,easetag,noah_kyc_status,kyc_verified_at")
    .eq("id", user.id)
    .maybeSingle()
  return {
    userId: user.id,
    legalName: String(data?.full_name || user.user_metadata?.full_name || ""),
    residenceCountry: data?.residence_country ? String(data.residence_country) : null,
    profilePhoto: data?.avatar_url ? String(data.avatar_url) : null,
    easetag: data?.easetag ? String(data.easetag) : null,
    verificationState: String(data?.noah_kyc_status || "unverified"),
    verifiedAt: data?.kyc_verified_at ? String(data.kyc_verified_at) : null,
  }
}

export async function sendPayrollConnectionResponseEmails(input: {
  admin: SupabaseClient
  businessId: string
  employeeEmail: string
  businessName: string
  recipientName: string
  outcome: "approved" | "declined"
}) {
  const { emailService } = await import("@easner/server")
  const template = input.outcome === "approved"
    ? "payrollConnectionApproved"
    : "payrollConnectionDeclined"
  await emailService.sendEmail({
    to: input.employeeEmail,
    template,
    audience: "personal",
    data: {
      businessName: input.businessName,
      recipientName: input.recipientName,
      forBusiness: false,
    },
  }).catch(() => undefined)

  const { data: owners } = await input.admin.from("users")
    .select("email").eq("easner_business_id", input.businessId)
  for (const owner of owners ?? []) {
    if (!owner.email) continue
    await emailService.sendEmail({
      to: String(owner.email),
      template,
      audience: "business",
      data: {
        businessName: input.businessName,
        recipientName: input.recipientName,
        forBusiness: true,
      },
    }).catch(() => undefined)
  }
}

export async function sendPayrollConnectionRevokedEmails(input: {
  admin: SupabaseClient
  businessId: string
  employeeEmail: string
  businessName: string
  recipientName: string
}) {
  const { emailService } = await import("@easner/server")
  await emailService.sendEmail({
    to: input.employeeEmail,
    template: "payrollConnectionRevoked",
    audience: "personal",
    data: {
      businessName: input.businessName,
      recipientName: input.recipientName,
      forBusiness: false,
    },
  }).catch(() => undefined)

  const { data: businessUsers } = await input.admin.from("users")
    .select("email").eq("easner_business_id", input.businessId)
  for (const businessUser of businessUsers ?? []) {
    if (!businessUser.email) continue
    await emailService.sendEmail({
      to: String(businessUser.email),
      template: "payrollConnectionRevoked",
      audience: "business",
      data: {
        businessName: input.businessName,
        recipientName: input.recipientName,
        forBusiness: true,
      },
    }).catch(() => undefined)
  }
}
