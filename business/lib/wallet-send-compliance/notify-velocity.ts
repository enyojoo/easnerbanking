import type { SupabaseClient } from "@supabase/supabase-js"
import { emailService } from "@easner/server"
import { formatWalletSendComplianceTime } from "@easner/shared"
import { resolveOrgOwnerUserId } from "@/lib/business/org-owner"
import {
  kycOfficeUserUrl,
  resolveComplianceOpsEmail,
} from "@/lib/notifications/kyb-email-recipients"
import { fetchUserEmailContact } from "@/lib/notifications/user-contact"
import type { VelocityControlRow } from "./velocity-store"
import { countRecentTriggers } from "./velocity-store"
import { walletSendComplianceConfig } from "./config"

async function fetchBusinessDisplayName(
  admin: SupabaseClient,
  businessId: string,
): Promise<string | undefined> {
  const { data } = await admin
    .from("businesses")
    .select("name,legal_name,display_name")
    .eq("id", businessId)
    .maybeSingle()
  const primary = String((data as { name?: string | null } | null)?.name ?? "").trim()
  if (primary) return primary
  const legal = String((data as { legal_name?: string | null } | null)?.legal_name ?? "").trim()
  if (legal) return legal
  const display = String((data as { display_name?: string | null } | null)?.display_name ?? "").trim()
  return display || undefined
}

async function sendOpsEmail(
  admin: SupabaseClient,
  input: {
    businessId: string
    event: "triggered" | "boosted" | "repeat"
    control: VelocityControlRow
    triggerCount?: number
  },
): Promise<void> {
  const opsEmail = resolveComplianceOpsEmail()
  if (!opsEmail) return
  const businessName = await fetchBusinessDisplayName(admin, input.businessId)
  const ownerUserId = await resolveOrgOwnerUserId(admin, input.businessId, input.businessId)
  const ownerContact = ownerUserId ? await fetchUserEmailContact(admin, ownerUserId) : null
  const subjectLabel = businessName || ownerContact?.email || input.businessId
  await emailService.sendEmail({
    to: opsEmail,
    template: "walletSendVelocityOpsNotification",
    audience: "business",
    data: {
      event: input.event,
      subjectLabel,
      subjectId: input.businessId,
      businessName,
      accountEmail: ownerContact?.email,
      ownerName: ownerContact?.firstName,
      triggerReason: input.control.trigger_reason,
      inboundTotalUsd: input.control.inbound_total_usd,
      maxSendUsd: input.control.max_send_usd,
      capPct: input.control.cap_pct,
      mode: input.control.mode,
      expiresAt: formatWalletSendComplianceTime(input.control.expires_at),
      triggerCount: input.triggerCount,
      officeUrl: ownerUserId ? kycOfficeUserUrl(ownerUserId) : undefined,
    },
  })
}

export async function notifyVelocityTrigger(
  admin: SupabaseClient,
  control: VelocityControlRow,
): Promise<void> {
  try {
    await sendOpsEmail(admin, {
      businessId: control.business_id,
      event: "triggered",
      control,
    })
  } catch (err) {
    console.error("[wallet-send-compliance] trigger email failed:", err)
  }
}

export async function notifyVelocityBooster(
  admin: SupabaseClient,
  control: VelocityControlRow,
): Promise<void> {
  try {
    await sendOpsEmail(admin, {
      businessId: control.business_id,
      event: "boosted",
      control,
    })
  } catch (err) {
    console.error("[wallet-send-compliance] booster email failed:", err)
  }
}

export async function maybeNotifyRepeatEscalation(
  admin: SupabaseClient,
  control: VelocityControlRow,
): Promise<boolean> {
  const cfg = walletSendComplianceConfig()
  const count = await countRecentTriggers(admin, control.business_id, cfg.repeatWindowDays)
  if (count < cfg.repeatThreshold) return false
  try {
    await sendOpsEmail(admin, {
      businessId: control.business_id,
      event: "repeat",
      control,
      triggerCount: count,
    })
  } catch (err) {
    console.error("[wallet-send-compliance] repeat email failed:", err)
  }
  return true
}

export function shouldEscalateRepeat(triggerCount: number, threshold = walletSendComplianceConfig().repeatThreshold) {
  return triggerCount >= threshold
}
