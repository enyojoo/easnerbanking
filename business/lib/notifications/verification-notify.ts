import type { SupabaseClient } from "@supabase/supabase-js"
import { emailService } from "@easner/server"
import type { VerificationEmailData } from "@easner/server"
import { getEmailAudienceProfile } from "@easner/server"
import { fetchUserEmailContact } from "@/lib/notifications/user-contact"
import {
  kybOfficeBusinessUrl,
  kycOfficeUserUrl,
  resolveComplianceOpsEmail,
  resolveKybMerchantRecipients,
} from "@/lib/notifications/kyb-email-recipients"

type VerificationStatus = "not_started" | "under_review" | "approved" | "rejected" | "action_needed"

function mapToEmailStatus(
  prev: VerificationStatus | null | undefined,
  next: VerificationStatus,
): VerificationEmailData["status"] | null {
  if (prev === next) return null
  if (next === "approved") return "approved"
  if (next === "rejected") return "rejected"
  if (next === "action_needed") return "action_needed"
  if (next === "under_review" && prev !== "under_review") return "submitted"
  return null
}

function kybTemplateForStatus(status: VerificationEmailData["status"]): string {
  if (status === "approved") return "kybApproved"
  if (status === "rejected") return "kybRejected"
  if (status === "action_needed") return "kybActionNeeded"
  return "kybSubmitted"
}

function kycTemplateForStatus(status: VerificationEmailData["status"]): string {
  if (status === "approved") return "kycApproved"
  if (status === "rejected") return "kycRejected"
  return "kycSubmitted"
}

async function fetchCommunicationPreferences(admin: SupabaseClient, userId: string) {
  const { data } = await admin
    .from("user_preferences")
    .select("communication_preferences")
    .eq("user_id", userId)
    .maybeSingle()
  return (data as { communication_preferences?: unknown } | null)?.communication_preferences
}

export async function notifyVerificationStatusChange(input: {
  admin: SupabaseClient
  userId: string
  userEmail: string
  firstName?: string
  kind: "kyb" | "kyc"
  previousStatus: VerificationStatus | null | undefined
  nextStatus: VerificationStatus
  rejectionReasons?: string[] | null
  businessName?: string
}): Promise<void> {
  const emailStatus = mapToEmailStatus(input.previousStatus, input.nextStatus)
  if (!emailStatus) return

  const audience = input.kind === "kyb" ? "business" : "personal"
  const template =
    input.kind === "kyb"
      ? kybTemplateForStatus(emailStatus)
      : emailStatus === "approved"
        ? "kycApproved"
        : emailStatus === "rejected"
          ? "kycRejected"
          : "kycSubmitted"

  const profile = getEmailAudienceProfile(audience)
  const prefs = await fetchCommunicationPreferences(input.admin, input.userId)

  const data: VerificationEmailData = {
    email: input.userEmail,
    firstName: input.firstName,
    status: emailStatus,
    businessName: input.businessName,
    rejectionReasons: input.rejectionReasons ?? undefined,
    dashboardUrl: profile.dashboardUrl,
    audience,
  }

  await emailService
    .sendEmail({ to: input.userEmail, template, data, audience }, prefs)
    .catch((e) => console.warn("verification email (non-fatal):", e))
}

export async function notifyBusinessKybStatusChange(
  admin: SupabaseClient,
  businessId: string,
  previousStatus: VerificationStatus | null | undefined,
  nextStatus: VerificationStatus,
  rejectionReasons?: string[] | null,
): Promise<void> {
  const emailStatus = mapToEmailStatus(previousStatus, nextStatus)
  if (!emailStatus) return

  const { data: business } = await admin
    .from("businesses")
    .select("name")
    .eq("id", businessId)
    .maybeSingle()
  const businessName = String(business?.name ?? "Easner Business").trim() || "Easner Business"

  const profile = getEmailAudienceProfile("business")
  const template = kybTemplateForStatus(emailStatus)
  const reasons = rejectionReasons ?? undefined

  const recipients = await resolveKybMerchantRecipients(admin, businessId)
  await Promise.all(
    recipients.map(async (recipient) => {
      const prefs = await fetchCommunicationPreferences(admin, recipient.userId)
      const data: VerificationEmailData = {
        email: recipient.email,
        firstName: recipient.firstName,
        status: emailStatus,
        businessName,
        rejectionReasons: reasons,
        dashboardUrl: profile.dashboardUrl,
        audience: "business",
      }
      await emailService
        .sendEmail({ to: recipient.email, template, data, audience: "business" }, prefs)
        .catch((e) => console.warn("kyb verification email (non-fatal):", e))
    }),
  )

  const opsEmail = resolveComplianceOpsEmail()
  if (opsEmail) {
    await emailService
      .sendEmail({
        to: opsEmail,
        template: "kybOpsNotification",
        audience: "business",
        data: {
          businessId,
          businessName,
          status: emailStatus,
          rejectionReasons: reasons,
          officeUrl: kybOfficeBusinessUrl(businessId),
        },
      })
      .catch((e) => console.warn("kyb ops verification email (non-fatal):", e))
  }
}

export async function notifyIndividualKycStatusChange(
  admin: SupabaseClient,
  userId: string,
  previousStatus: VerificationStatus | null | undefined,
  nextStatus: VerificationStatus,
  rejectionReasons?: string[] | null,
): Promise<void> {
  const emailStatus = mapToEmailStatus(previousStatus, nextStatus)
  if (!emailStatus) return

  const contact = await fetchUserEmailContact(admin, userId)
  if (!contact.email) return

  const profile = getEmailAudienceProfile("personal")
  const template = kycTemplateForStatus(emailStatus)
  const reasons = rejectionReasons ?? undefined
  const prefs = await fetchCommunicationPreferences(admin, userId)

  const data: VerificationEmailData = {
    email: contact.email,
    firstName: contact.firstName,
    status: emailStatus,
    rejectionReasons: reasons,
    dashboardUrl: profile.dashboardUrl,
    audience: "personal",
  }

  await emailService
    .sendEmail({ to: contact.email, template, data, audience: "personal" }, prefs)
    .catch((e) => console.warn("kyc verification email (non-fatal):", e))

  const { data: userRow } = await admin
    .from("users")
    .select("full_name")
    .eq("id", userId)
    .maybeSingle()
  const userDisplayName =
    (typeof userRow?.full_name === "string" && userRow.full_name.trim()) || contact.firstName

  const opsEmail = resolveComplianceOpsEmail()
  if (opsEmail) {
    await emailService
      .sendEmail({
        to: opsEmail,
        template: "kycOpsNotification",
        audience: "personal",
        data: {
          userId,
          userEmail: contact.email,
          userDisplayName,
          status: emailStatus,
          rejectionReasons: reasons,
          officeUrl: kycOfficeUserUrl(userId),
        },
      })
      .catch((e) => console.warn("kyc ops verification email (non-fatal):", e))
  }
}
