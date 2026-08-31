import type { SupabaseClient } from "@supabase/supabase-js"
import { emailService } from "@easner/server"
import { displayRoleFromMembership } from "@/lib/business/claim-team-invite"
import { resolveKybMerchantRecipients } from "@/lib/notifications/kyb-email-recipients"

export async function notifyTeamMemberJoined(params: {
  admin: SupabaseClient
  businessId: string
  joinerUserId: string
  joinerEmail: string
  joinerName: string
  role: string
}): Promise<void> {
  const { admin, businessId, joinerUserId, joinerEmail, joinerName, role } = params

  const { data: business } = await admin
    .from("businesses")
    .select("name")
    .eq("id", businessId)
    .maybeSingle()

  const businessName = String(business?.name ?? "Easner Business").trim() || "Easner Business"
  const settingsTeamUrl = `${
    process.env.NEXT_PUBLIC_BUSINESS_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    "https://business.easner.com"
  }/settings?tab=team`

  const recipients = await resolveKybMerchantRecipients(admin, businessId)
  const joinerEmailNorm = joinerEmail.trim().toLowerCase()

  for (const recipient of recipients) {
    if (recipient.userId === joinerUserId) continue
    if (recipient.email.trim().toLowerCase() === joinerEmailNorm) continue

    await emailService
      .sendEmail(
        {
          to: recipient.email,
          template: "teamMemberJoined",
          audience: "business",
          data: {
            recipientFirstName: recipient.firstName,
            businessName,
            memberName: joinerName,
            memberEmail: joinerEmail,
            role: displayRoleFromMembership(role),
            settingsTeamUrl,
          },
        },
        undefined,
      )
      .catch((e) => console.warn("team join email (non-fatal):", e))
  }
}
