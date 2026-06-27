import type { SupabaseClient } from "@supabase/supabase-js"
import { emailService } from "@easner/server"
import type { VerificationEmailData } from "@easner/server"
import { getEmailAudienceProfile } from "@easner/server"
import { resolveEmailAudience } from "@/lib/notifications/resolve-email-audience"
import { resolveOrgOwnerUserId } from "@/lib/business/org-owner"

type VerificationStatus = "not_started" | "under_review" | "approved" | "rejected"

function mapToEmailStatus(
  prev: VerificationStatus | null | undefined,
  next: VerificationStatus,
): VerificationEmailData["status"] | null {
  if (prev === next) return null
  if (next === "approved") return "approved"
  if (next === "rejected") return "rejected"
  if (next === "under_review" && prev !== "under_review") return "submitted"
  return null
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
}): Promise<void> {
  const emailStatus = mapToEmailStatus(input.previousStatus, input.nextStatus)
  if (!emailStatus) return

  const audience = input.kind === "kyb" ? "business" : "personal"
  const template =
    input.kind === "kyb"
      ? emailStatus === "approved"
        ? "kybApproved"
        : emailStatus === "rejected"
          ? "kybRejected"
          : "kybSubmitted"
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
  const ownerUserId = await resolveOrgOwnerUserId(admin, businessId, "")
  if (!ownerUserId) return

  const { data: user } = await admin
    .from("users")
    .select("email,first_name")
    .eq("id", ownerUserId)
    .maybeSingle()
  if (!user?.email) return

  await notifyVerificationStatusChange({
    admin,
    userId: ownerUserId,
    userEmail: user.email,
    firstName: user.first_name ?? undefined,
    kind: "kyb",
    previousStatus,
    nextStatus,
    rejectionReasons,
  })
}

export async function notifyIndividualKycStatusChange(
  admin: SupabaseClient,
  userId: string,
  previousStatus: VerificationStatus | null | undefined,
  nextStatus: VerificationStatus,
  rejectionReasons?: string[] | null,
): Promise<void> {
  const { data: user } = await admin
    .from("users")
    .select("email,first_name")
    .eq("id", userId)
    .maybeSingle()
  if (!user?.email) return

  await notifyVerificationStatusChange({
    admin,
    userId,
    userEmail: user.email,
    firstName: user.first_name ?? undefined,
    kind: "kyc",
    previousStatus,
    nextStatus,
    rejectionReasons,
  })
}
