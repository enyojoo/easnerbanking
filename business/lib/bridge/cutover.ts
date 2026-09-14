import type { SupabaseClient } from "@supabase/supabase-js"
import { isBridgeOnboardableResidence, personalMobileVerificationUrl } from "@easner/shared"
import { getBridgeCutoverWindDownDays } from "./config"

export const MOBILE_BRIDGE_CUTOVER_COPY = {
  bannerTitle: "Update verification to keep receiving bank deposits",
  bannerCta: "Continue",
  cardFootnote: "Finish the updated check so new bank details stay available.",
} as const

function asIso(d: Date): string {
  return d.toISOString()
}

export async function ensureMobileBridgeCutover(
  admin: SupabaseClient,
  userId: string,
): Promise<{ required: boolean; deadlineAt: string | null; emailSent: boolean }> {
  const { data: row } = await admin
    .from("users")
    .select(
      "id,email,full_name,role,residence_country,kyc_address_country,kyc_address_state,noah_kyc_status,verification_provider,verification_status,bridge_kyc_status,bridge_customer_id,bridge_cutover_required_at,bridge_cutover_deadline_at,bridge_cutover_email_sent_at",
    )
    .eq("id", userId)
    .maybeSingle()
  if (!row || String(row.role ?? "").toLowerCase() === "business") {
    return { required: false, deadlineAt: null, emailSent: false }
  }

  const country = String(row.kyc_address_country ?? row.residence_country ?? "").trim()
  const state = String(row.kyc_address_state ?? "").trim()
  if (!isBridgeOnboardableResidence({ countryCode: country, state })) {
    return { required: false, deadlineAt: null, emailSent: false }
  }

  const bridgeStatus = String(row.bridge_kyc_status ?? row.verification_status ?? "")
    .trim()
    .toLowerCase()
  const provider = String(row.verification_provider ?? "").trim().toLowerCase()
  if (provider === "bridge" && bridgeStatus === "approved") {
    return { required: false, deadlineAt: null, emailSent: Boolean(row.bridge_cutover_email_sent_at) }
  }

  const noahStatus = String(row.noah_kyc_status ?? "").trim().toLowerCase()
  const hadNoah =
    Boolean(String(row.noah_kyc_status ?? "").trim()) &&
    noahStatus !== "not_started" &&
    provider !== "bridge"
  if (!hadNoah) {
    return { required: false, deadlineAt: null, emailSent: false }
  }

  const now = new Date()
  let requiredAt = String(row.bridge_cutover_required_at ?? "").trim()
  let deadlineAt = String(row.bridge_cutover_deadline_at ?? "").trim()
  if (!requiredAt) {
    requiredAt = asIso(now)
    const days = getBridgeCutoverWindDownDays()
    deadlineAt = asIso(new Date(now.getTime() + days * 24 * 60 * 60 * 1000))
    await admin
      .from("users")
      .update({
        bridge_cutover_required_at: requiredAt,
        bridge_cutover_deadline_at: deadlineAt,
        updated_at: asIso(now),
      })
      .eq("id", userId)
  }

  let emailSent = Boolean(row.bridge_cutover_email_sent_at)
  const email = String(row.email ?? "").trim()
  if (!emailSent && email) {
    const firstName = String(row.full_name ?? "").trim().split(/\s+/)[0] || "there"
    try {
      const { emailService } = await import("@easner/server")
      const { data: prefsRow } = await admin
        .from("user_preferences")
        .select("communication_preferences")
        .eq("user_id", userId)
        .maybeSingle()
      const result = await emailService.sendEmail(
        {
          to: email,
          template: "kycVerificationUpdate",
          audience: "personal",
          data: {
            firstName,
            email,
            verifyUrl: personalMobileVerificationUrl(),
            deadlineAt,
          },
        },
        (prefsRow as { communication_preferences?: unknown } | null)?.communication_preferences,
      )
      if (!result.success || result.skipped) {
        throw new Error(result.skipReason || "Cutover email was not sent")
      }
      await admin
        .from("users")
        .update({
          bridge_cutover_email_sent_at: asIso(now),
          updated_at: asIso(now),
        })
        .eq("id", userId)
      emailSent = true
    } catch (error) {
      console.warn("[bridge] cutover email failed", error)
    }
  }

  return { required: true, deadlineAt: deadlineAt || null, emailSent }
}

export function shouldHideNoahConsumerVirtualAccounts(row: {
  verification_provider?: string | null
  verification_status?: string | null
  bridge_kyc_status?: string | null
  bridge_cutover_deadline_at?: string | null
  kyc_address_country?: string | null
  residence_country?: string | null
  kyc_address_state?: string | null
} | null): boolean {
  if (!row) return false
  const country = String(row.kyc_address_country ?? row.residence_country ?? "").trim()
  const state = String(row.kyc_address_state ?? "").trim()
  if (!isBridgeOnboardableResidence({ countryCode: country, state })) return false
  const bridgeApproved =
    String(row.bridge_kyc_status ?? "").toLowerCase() === "approved" ||
    (String(row.verification_provider ?? "").toLowerCase() === "bridge" &&
      String(row.verification_status ?? "").toLowerCase() === "approved")
  if (bridgeApproved) return true
  const deadline = String(row.bridge_cutover_deadline_at ?? "").trim()
  if (!deadline) return false
  const at = new Date(deadline).getTime()
  return Number.isFinite(at) && Date.now() >= at
}
