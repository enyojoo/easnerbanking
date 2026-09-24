import type { SupabaseClient } from "@supabase/supabase-js"
import { persistVerificationStatus } from "@/lib/compliance/verification-store"
import {
  notifyBusinessKybStatusChange,
  notifyIndividualKycStatusChange,
} from "@/lib/notifications/verification-notify"
import { parseBridgeRejectionNotices } from "./rejection-reasons"

type EmailStatus = "not_started" | "under_review" | "approved" | "rejected" | "action_needed"

function bridgeStatusForEmail(status: string): EmailStatus {
  const normalized = status.trim().toLowerCase()
  if (normalized === "approved") return "approved"
  if (normalized === "rejected") return "rejected"
  if (normalized === "pending") return "under_review"
  return "not_started"
}

function missingRejectionColumn(error: { message?: string; code?: string } | null): boolean {
  if (!error) return false
  const text = String(error.message ?? "").toLowerCase()
  return text.includes("bridge_kyc_rejection_reasons") && (error.code === "42703" || error.code === "PGRST204" || text.includes("column"))
}

function hasStoredReasons(value: unknown): boolean {
  return Array.isArray(value) && value.length > 0
}

/**
 * Save Bridge status and rejection text, then email like Grid.
 * The customer receives `reason`. Compliance receives `developer_reason`.
 * A rejection that was stored without reasons still sends once those reasons arrive.
 * Sync polls (GET often omits rejection_reasons) must not re-email or wipe stored reasons.
 */
export async function recordBridgeVerificationOutcome(
  admin: SupabaseClient,
  input: {
    userId: string
    businessId?: string | null
    customerId: string
    status: string
    customer: Record<string, unknown>
    extra?: Record<string, unknown>
  },
): Promise<void> {
  const businessId = String(input.businessId ?? "").trim()
  const table = businessId ? "businesses" : "users"
  const subjectId = businessId || input.userId
  const notices = parseBridgeRejectionNotices(input.customer)
  const stored = notices.stored.length ? notices.stored : null

  const prior = await admin
    .from(table)
    .select("bridge_kyc_status,bridge_kyc_rejection_reasons")
    .eq("id", subjectId)
    .maybeSingle()
  let previousStatus = String(prior.data?.bridge_kyc_status ?? "not_started")
  let hadReasons = hasStoredReasons(prior.data?.bridge_kyc_rejection_reasons)
  if (prior.error && missingRejectionColumn(prior.error)) {
    const fallback = await admin
      .from(table)
      .select("bridge_kyc_status,verification_rejection_reasons")
      .eq("id", subjectId)
      .maybeSingle()
    previousStatus = String(fallback.data?.bridge_kyc_status ?? "not_started")
    hadReasons = hasStoredReasons(fallback.data?.verification_rejection_reasons)
  } else if (!hadReasons) {
    const fallback = await admin
      .from(table)
      .select("verification_rejection_reasons")
      .eq("id", subjectId)
      .maybeSingle()
    hadReasons = hasStoredReasons(fallback.data?.verification_rejection_reasons)
  }

  await persistVerificationStatus(admin, {
    kind: businessId ? "business" : "individual",
    businessId: businessId || null,
    userId: input.userId,
    provider: "bridge",
    status: input.status as "not_started" | "in_progress" | "pending" | "approved" | "rejected" | "hold",
    // Omit when Bridge GET has no reasons so sync does not wipe webhook-stored copy.
    rejectionReasons: businessId ? undefined : stored ?? undefined,
    bridgeCustomerId: input.customerId,
    extra: input.extra,
  })

  if (stored) {
    const reasonWrite = await admin
      .from(table)
      .update({ bridge_kyc_rejection_reasons: stored, updated_at: new Date().toISOString() })
      .eq("id", subjectId)
    if (reasonWrite.error && !missingRejectionColumn(reasonWrite.error)) {
      console.warn("[bridge] rejection reasons persist failed", reasonWrite.error.message)
    }
    if (businessId) {
      const existing = await admin
        .from("businesses")
        .select("verification_rejection_reasons")
        .eq("id", businessId)
        .maybeSingle()
      if (!hasStoredReasons(existing.data?.verification_rejection_reasons)) {
        await admin
          .from("businesses")
          .update({ verification_rejection_reasons: stored, updated_at: new Date().toISOString() })
          .eq("id", businessId)
      }
    }
  }

  const nextEmail = bridgeStatusForEmail(input.status)
  const previousEmailStatus = bridgeStatusForEmail(previousStatus)
  // Only treat as a fresh rejection when reasons first arrive after a bare reject.
  // Without this guard, sync-status re-emails forever when Bridge GET omits rejection_reasons.
  const reasonsJustArrived =
    nextEmail === "rejected" && previousEmailStatus === "rejected" && !hadReasons && Boolean(stored)
  const previousEmail = reasonsJustArrived ? "not_started" : previousEmailStatus

  const customerReasons = notices.customerReasons.length ? notices.customerReasons : null
  const complianceReasons = notices.complianceReasons.length ? notices.complianceReasons : null

  if (businessId) {
    await notifyBusinessKybStatusChange(
      admin,
      businessId,
      previousEmail,
      nextEmail,
      customerReasons,
      complianceReasons,
    ).catch((error) => console.warn("[bridge] kyb verification email failed", error))
    return
  }

  await notifyIndividualKycStatusChange(
    admin,
    input.userId,
    previousEmail,
    nextEmail,
    customerReasons,
    complianceReasons,
  ).catch((error) => console.warn("[bridge] kyc verification email failed", error))
}
