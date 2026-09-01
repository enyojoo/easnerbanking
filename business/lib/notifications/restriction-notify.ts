import type { SupabaseClient } from "@supabase/supabase-js"
import { emailService, getEmailAudienceProfile } from "@easner/server"
import type { AccountRestrictionEmailData } from "@easner/server"
import { computeAccountRestrictionPhase, formatAccountRestrictionDeadline } from "@easner/shared"
import type { AccountRestrictionRow } from "@/lib/account-restriction/store"
import { resolveOrgOwnerUserId } from "@/lib/business/org-owner"
import {
  kycOfficeUserUrl,
  resolveComplianceOpsEmail,
  resolveKybMerchantRecipients,
} from "@/lib/notifications/kyb-email-recipients"
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
    .select("legal_name,display_name,name")
    .eq("id", businessId)
    .maybeSingle()
  const legal = String((data as { legal_name?: string | null } | null)?.legal_name ?? "").trim()
  if (legal) return legal
  const display = String((data as { display_name?: string | null } | null)?.display_name ?? "").trim()
  if (display) return display
  const name = String((data as { name?: string | null } | null)?.name ?? "").trim()
  return name || undefined
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
  template: "accountRestricted" | "accountRestrictionClosed" | "accountRestrictionLifted",
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

async function sendRestrictionOpsEmail(
  admin: SupabaseClient,
  row: AccountRestrictionRow,
  event: "applied" | "lifted" | "closed",
): Promise<void> {
  const opsEmail = resolveComplianceOpsEmail()
  if (!opsEmail) return

  const phase = computeAccountRestrictionPhase({
    restrictedAt: row.restricted_at,
    windDownEndsAt: row.wind_down_ends_at,
    lockedAt: row.locked_at,
  })

  if (row.subject_kind === "business" && row.business_id) {
    const businessName = await fetchBusinessDisplayName(admin, row.business_id)
    const ownerUserId = await resolveOrgOwnerUserId(admin, row.business_id, row.business_id)
    await emailService.sendEmail({
      to: opsEmail,
      template: "accountRestrictionOpsNotification",
      audience: "business",
      data: {
        event,
        subjectKind: "business",
        subjectLabel: businessName || row.business_id,
        subjectId: row.business_id,
        phase: event === "applied" ? phase : undefined,
        source: row.source,
        reason: row.reason,
        windDownEndsAt:
          event === "applied" ? formatAccountRestrictionDeadline(row.wind_down_ends_at) || null : null,
        officeUrl: ownerUserId ? kycOfficeUserUrl(ownerUserId) : undefined,
      },
    })
    return
  }

  if (row.user_id) {
    const contact = await fetchUserEmailContact(admin, row.user_id)
    const label =
      contact.email ||
      contact.firstName ||
      String((await admin.from("users").select("full_name").eq("id", row.user_id).maybeSingle()).data
        ?.full_name ?? "") ||
      row.user_id
    await emailService.sendEmail({
      to: opsEmail,
      template: "accountRestrictionOpsNotification",
      audience: "personal",
      data: {
        event,
        subjectKind: "user",
        subjectLabel: label,
        subjectId: row.user_id,
        phase: event === "applied" ? phase : undefined,
        source: row.source,
        reason: row.reason,
        windDownEndsAt:
          event === "applied" ? formatAccountRestrictionDeadline(row.wind_down_ends_at) || null : null,
        officeUrl: kycOfficeUserUrl(row.user_id),
      },
    })
  }
}

export async function notifyAccountRestrictionApplied(
  admin: SupabaseClient,
  row: AccountRestrictionRow,
): Promise<void> {
  const recipients = await resolveRestrictionRecipients(admin, row)
  const businessName =
    row.subject_kind === "business" && row.business_id
      ? await fetchBusinessDisplayName(admin, row.business_id)
      : undefined
  const windDownDeadline = formatAccountRestrictionDeadline(row.wind_down_ends_at)

  await Promise.all([
    recipients.length
      ? sendRestrictionEmails(admin, recipients, "accountRestricted", (recipient, audience) => ({
          email: recipient.email,
          firstName: recipient.firstName,
          businessName: audience === "business" ? businessName : undefined,
          responseDeadline: windDownDeadline || undefined,
        }))
      : Promise.resolve(),
    sendRestrictionOpsEmail(admin, row, "applied"),
  ])
}

export async function notifyAccountRestrictionClosed(
  admin: SupabaseClient,
  row: AccountRestrictionRow,
): Promise<void> {
  const recipients = await resolveRestrictionRecipients(admin, row)
  const businessName =
    row.subject_kind === "business" && row.business_id
      ? await fetchBusinessDisplayName(admin, row.business_id)
      : undefined

  await Promise.all([
    recipients.length
      ? sendRestrictionEmails(admin, recipients, "accountRestrictionClosed", (recipient, audience) => ({
          email: recipient.email,
          firstName: recipient.firstName,
          businessName: audience === "business" ? businessName : undefined,
        }))
      : Promise.resolve(),
    sendRestrictionOpsEmail(admin, row, "closed"),
  ])
}

export async function notifyAccountRestrictionLifted(
  admin: SupabaseClient,
  row: AccountRestrictionRow,
): Promise<void> {
  const recipients = await resolveRestrictionRecipients(admin, row)
  const businessName =
    row.subject_kind === "business" && row.business_id
      ? await fetchBusinessDisplayName(admin, row.business_id)
      : undefined

  await Promise.all([
    recipients.length
      ? sendRestrictionEmails(admin, recipients, "accountRestrictionLifted", (recipient, audience) => ({
          email: recipient.email,
          firstName: recipient.firstName,
          businessName: audience === "business" ? businessName : undefined,
        }))
      : Promise.resolve(),
    sendRestrictionOpsEmail(admin, row, "lifted"),
  ])
}
