import { createSupabaseAdmin } from "@/lib/supabase/admin"
import { resolveOrgOwnerUserId } from "@/lib/business/org-owner"
import { mapNoahVerificationToKycStatus } from "./map-kyc"
import { parseNoahCustomerForBusiness } from "./parse-noah-customer-for-business"
import { parseNoahBusinessPersonForOwnerUsers } from "./parse-noah-associate-for-users"
import { parseNoahCustomerForUsers } from "./parse-noah-customer-for-users"
import { extractNoahRejectionReasons, pickNoahRejectionReasonsToStore } from "./rejection-reasons"
import {
  notifyBusinessKybStatusChange,
  notifyIndividualKycStatusChange,
} from "@/lib/notifications/verification-notify"
import { mapNoahPartnerStatus, persistVerificationStatus } from "@/lib/compliance"
import { businessUsesGridVerification } from "@/lib/compliance/business-tier1"

type VerificationStatus = "not_started" | "under_review" | "approved" | "rejected"

/**
 * Persist Noah customer id + mapped KYC/KYB status (+ decline reasons when rejected).
 * On individual approval, sync verified identity + lock profile fields (name, DOB) from Noah.
 */
export async function syncNoahCustomerToSupabase(
  target: { kind: "individual"; userId: string } | { kind: "business"; businessId: string },
  customer: Record<string, unknown>,
  customerId: string,
  options?: { occurredAt?: string },
): Promise<void> {
  const admin = createSupabaseAdmin()
  const kyc = mapNoahVerificationToKycStatus(customer)
  const extractedReasons = kyc === "rejected" ? extractNoahRejectionReasons(customer) : null
  const now = new Date().toISOString()

  if (target.kind === "business") {
    const { data: priorBiz } = await admin
      .from("businesses")
      .select("verification_provider,verification_status,verification_rejection_reasons")
      .eq("id", target.businessId)
      .maybeSingle()

    if (businessUsesGridVerification(priorBiz as { verification_provider?: string | null } | null)) {
      return
    }

    const previousStatus = String(priorBiz?.verification_status ?? "not_started").toLowerCase() as VerificationStatus

    let rejectionReasons = extractedReasons
    if (kyc === "rejected") {
      rejectionReasons = pickNoahRejectionReasonsToStore(
        priorBiz?.verification_rejection_reasons as unknown[] | null | undefined,
        extractedReasons,
      )
    }

    const profilePatch: Record<string, unknown> =
      kyc === "approved"
        ? parseNoahCustomerForBusiness(customer, { occurredAt: options?.occurredAt })
        : {}
    if (Object.keys(profilePatch).length > 0) {
      await admin
        .from("businesses")
        .update({ ...profilePatch, updated_at: now })
        .eq("id", target.businessId)
    }

    const ownerUserId = await resolveOrgOwnerUserId(admin, target.businessId, "")
    await persistVerificationStatus(admin, {
      kind: "business",
      businessId: target.businessId,
      userId: ownerUserId || target.businessId,
      provider: "noah",
      status: mapNoahPartnerStatus(kyc),
      rejectionReasons,
      verifiedAt: kyc === "approved" ? options?.occurredAt ?? now : null,
    })

    await notifyBusinessKybStatusChange(
      admin,
      target.businessId,
      previousStatus,
      kyc as VerificationStatus,
      Array.isArray(rejectionReasons) ? rejectionReasons.map(String) : null,
    ).catch((e) => console.warn("kyb verification email (non-fatal):", e))

    if (kyc === "approved" && ownerUserId) {
        const { data: ownerRow } = await admin
          .from("users")
          .select("noah_kyc_status, email")
          .eq("id", ownerUserId)
          .maybeSingle()
        const individualApproved =
          String(ownerRow?.noah_kyc_status ?? "").toLowerCase() === "approved"
        if (!individualApproved) {
          // Prefer top-level Identities; else Associates[] representative (KYB-only owners).
          if (Array.isArray(customer.Associates) || Array.isArray(customer.associates)) {
            console.info("[noah-kyb] approved business customer has Associates[]", {
              businessId: target.businessId,
              customerId,
              associateCount: Array.isArray(customer.Associates)
                ? customer.Associates.length
                : Array.isArray(customer.associates)
                  ? customer.associates.length
                  : 0,
            })
          } else {
            console.info("[noah-kyb] approved business customer payload shape (no Associates)", {
              businessId: target.businessId,
              customerId,
              topKeys: Object.keys(customer).slice(0, 40),
            })
          }
          const personUpdate = parseNoahBusinessPersonForOwnerUsers(customer, {
            occurredAt: options?.occurredAt,
            ownerEmail: typeof ownerRow?.email === "string" ? ownerRow.email : null,
          })
          if (Object.keys(personUpdate).length > 1) {
            await admin
              .from("users")
              .update({ ...personUpdate, updated_at: now })
              .eq("id", ownerUserId)
          }
        }
    }
    return
  }

  const { data: priorUser } = await admin
    .from("users")
    .select("noah_kyc_status")
    .eq("id", target.userId)
    .maybeSingle()
  const previousStatus = String(priorUser?.noah_kyc_status ?? "not_started").toLowerCase() as VerificationStatus

  let rejectionReasons = extractedReasons
  if (kyc === "rejected") {
    const { data: existingRow } = await admin
      .from("users")
      .select("noah_kyc_rejection_reasons")
      .eq("id", target.userId)
      .maybeSingle()
    rejectionReasons = pickNoahRejectionReasonsToStore(
      existingRow?.noah_kyc_rejection_reasons as unknown[] | null | undefined,
      extractedReasons,
    )
  }

  const update: Record<string, unknown> = {
    noah_customer_id: customerId,
    noah_kyc_status: kyc,
    noah_kyc_rejection_reasons: rejectionReasons,
    updated_at: now,
  }

  if (kyc === "approved") {
    Object.assign(update, parseNoahCustomerForUsers(customer, { occurredAt: options?.occurredAt }))
  }

  await admin.from("users").update(update).eq("id", target.userId)

  // Keep canonical SoR in lockstep with Noah mirrors (money-movement gates read verification_status).
  await persistVerificationStatus(admin, {
    kind: "individual",
    userId: target.userId,
    provider: "noah",
    status: mapNoahPartnerStatus(kyc),
    rejectionReasons,
    verifiedAt: kyc === "approved" ? options?.occurredAt ?? now : null,
  })

  await notifyIndividualKycStatusChange(
    admin,
    target.userId,
    previousStatus,
    kyc as VerificationStatus,
    Array.isArray(rejectionReasons) ? rejectionReasons.map(String) : null,
  ).catch((e) => console.warn("kyc verification email (non-fatal):", e))
}
