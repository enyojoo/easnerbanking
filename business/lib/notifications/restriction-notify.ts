import type { SupabaseClient } from "@supabase/supabase-js"
import { emailService, getEmailAudienceProfile } from "@easner/server"
import type { AccountRestrictionEmailData } from "@easner/server"
import { formatAccountRestrictionDeadline } from "@easner/shared"
import type { AccountRestrictionRow } from "@/lib/account-restriction/store"
import { resolveKybMerchantRecipients } from "@/lib/notifications/kyb-email-recipients"
import { resolveEmailAudience } from "@/lib/notifications/resolve-email-audience"
import { fetchUserEmailContact } from "@/lib/notifications/user-contact"

type RestrictionRecipient = {
  userId: string
  email: string
  firstName?: string
}

async function fetchCommunicationPreferences(admin: SupabaseClient, userId: string) {
  const { data } = await admin
    .from("user_preferences")
    .select("communication_preferences")
    .eq("user_id", userId)
    .maybeSingle()
  return (data as { communication_preferences?: unknown } | null)?.communication_preferences
}

async function fetchBusinessDisplayName(
  admin: SupabaseClient,
  businessId: string,
): Promise<string | undefined> {
  const { data } = await admin
    .from("businesses")
    .select("legal_name,display_name")
    .eq("id", businessId)
    .maybeSingle()
  const legal = String((data as { legal_name?: string | null } | null)?.legal_name ?? "").trim()
  if (legal) return legal
  const display = String((data as { display_name?: string | null } | null)?.display_name ?? "").trim()
  return display || undefined
}

async function resolveRestrictionRecipients(
  admin: SupabaseClient,
  row: AccountRestrictionRow,
): Promise<RestrictionRecipient[]> {
  if (row.subject_kind === "business" && row.business_id) {
    return resolveKybMerchantRecipients(admin, row.business_id)
  }
  if (row.user_id) {
    const contact = await fetchUserEmailContact(admin, row.user_id)
    if (!contact.email) return []
    return [{ userId: row.user_id, email: contact.email, firstName: contact.firstName }]
  }
  return []
}

async function sendRestrictionEmails(
  admin: SupabaseClient,
  recipients: RestrictionRecipient[],
  template: "accountRestricted" | "accountRestrictionLifted",
  buildData: (recipient: RestrictionRecipient, audience: "business" | "personal") => AccountRestrictionEmailData,
): Promise<void> {
  for (const recipient of recipients) {
    const audience = await resolveEmailAudience(admin, recipient.userId)
    const prefs = await fetchCommunicationPreferences(admin, recipient.userId)
    const profile = getEmailAudienceProfile(audience)
    await emailService.sendEmail(
      {
        to: recipient.email,
        template,
        data: {
          ...buildData(recipient, audience),
          dashboardUrl: profile.dashboardUrl,
          audience,
        },
        audience,
      },
      prefs,
    )
  }
}

export async function notifyAccountRestrictionApplied(
  admin: SupabaseClient,
  row: AccountRestrictionRow,
): Promise<void> {
  const recipients = await resolveRestrictionRecipients(admin, row)
  if (recipients.length === 0) return

  const businessName =
    row.subject_kind === "business" && row.business_id
      ? await fetchBusinessDisplayName(admin, row.business_id)
      : undefined
  const windDownDeadline = formatAccountRestrictionDeadline(row.wind_down_ends_at)

  await sendRestrictionEmails(admin, recipients, "accountRestricted", (recipient, audience) => ({
    email: recipient.email,
    firstName: recipient.firstName,
    businessName: audience === "business" ? businessName : undefined,
    windDownDeadline: windDownDeadline || undefined,
  }))
}

export async function notifyAccountRestrictionLifted(
  admin: SupabaseClient,
  row: AccountRestrictionRow,
): Promise<void> {
  const recipients = await resolveRestrictionRecipients(admin, row)
  if (recipients.length === 0) return

  const businessName =
    row.subject_kind === "business" && row.business_id
      ? await fetchBusinessDisplayName(admin, row.business_id)
      : undefined

  await sendRestrictionEmails(admin, recipients, "accountRestrictionLifted", (recipient, audience) => ({
    email: recipient.email,
    firstName: recipient.firstName,
    businessName: audience === "business" ? businessName : undefined,
  }))
}
