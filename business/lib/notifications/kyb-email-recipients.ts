import type { SupabaseClient } from "@supabase/supabase-js"
import { resolveOrgOwnerUserId } from "@/lib/business/org-owner"
import { fetchUserEmailContact } from "@/lib/notifications/user-contact"

export type KybMerchantRecipient = {
  userId: string
  email: string
  firstName?: string
}

function isPrivilegedMembership(role: string | null | undefined, status: string | null | undefined): boolean {
  if (status === "invited") return false
  const normalized = String(role ?? "").trim().toLowerCase()
  return normalized === "owner" || normalized === "admin"
}

/** Active org owner + admins who should receive merchant-facing KYB lifecycle emails. */
export async function resolveKybMerchantRecipients(
  admin: SupabaseClient,
  businessId: string,
): Promise<KybMerchantRecipient[]> {
  const { data: memberships } = await admin
    .from("business_memberships")
    .select("user_id,role,status")
    .eq("business_id", businessId)

  let userIds = [
    ...new Set(
      (memberships ?? [])
        .filter((row) => row.user_id && isPrivilegedMembership(row.role, row.status))
        .map((row) => String(row.user_id)),
    ),
  ]

  if (userIds.length === 0) {
    const ownerUserId = await resolveOrgOwnerUserId(admin, businessId, "")
    if (ownerUserId) userIds = [ownerUserId]
  }

  const recipients: KybMerchantRecipient[] = []
  const seenEmails = new Set<string>()

  for (const userId of userIds) {
    const contact = await fetchUserEmailContact(admin, userId)
    const email = contact.email?.trim()
    if (!email) continue
    const key = email.toLowerCase()
    if (seenEmails.has(key)) continue
    seenEmails.add(key)
    recipients.push({ userId, email, firstName: contact.firstName })
  }

  return recipients
}

const DEFAULT_COMPLIANCE_OPS_EMAIL = "compliance@easner.com"

/** Easner compliance inbox for internal KYB/KYC lifecycle alerts. */
export function resolveComplianceOpsEmail(): string | null {
  const configured =
    process.env.EASNER_COMPLIANCE_OPS_EMAIL?.trim() || process.env.EASNER_KYB_OPS_EMAIL?.trim()
  const email = configured || DEFAULT_COMPLIANCE_OPS_EMAIL
  return email || null
}

/** @deprecated Prefer resolveComplianceOpsEmail */
export const resolveKybOpsEmail = resolveComplianceOpsEmail

export function kybOfficeBusinessUrl(businessId: string): string {
  const base = (process.env.NEXT_PUBLIC_OFFICE_URL || "https://bk.easner.com").replace(/\/$/, "")
  return `${base}/businesses?highlight=${encodeURIComponent(businessId)}`
}

export function kycOfficeUserUrl(userId: string): string {
  const base = (process.env.NEXT_PUBLIC_OFFICE_URL || "https://bk.easner.com").replace(/\/$/, "")
  return `${base}/users?highlight=${encodeURIComponent(userId)}`
}
