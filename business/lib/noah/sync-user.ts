import { createSupabaseAdmin } from "@/lib/supabase/admin"
import { resolveOrgOwnerUserId } from "@/lib/business/org-owner"
import { mapNoahVerificationToKycStatus } from "./map-kyc"
import { parseNoahCustomerForBusiness } from "./parse-noah-customer-for-business"
import { parseNoahCustomerForUsers } from "./parse-noah-customer-for-users"
import { extractNoahRejectionReasons } from "./rejection-reasons"

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
  const rejectionReasons = kyc === "rejected" ? extractNoahRejectionReasons(customer) : null
  const now = new Date().toISOString()

  if (target.kind === "business") {
    const update: Record<string, unknown> = {
      noah_customer_id: customerId,
      noah_kyb_status: kyc,
      noah_kyb_rejection_reasons: rejectionReasons,
      updated_at: now,
    }
    if (kyc === "approved") {
      Object.assign(update, parseNoahCustomerForBusiness(customer, { occurredAt: options?.occurredAt }))
    }
    await admin.from("businesses").update(update).eq("id", target.businessId)

    if (kyc === "approved") {
      const ownerUserId = await resolveOrgOwnerUserId(admin, target.businessId, "")
      if (ownerUserId) {
        const { data: ownerRow } = await admin
          .from("users")
          .select("noah_kyc_status")
          .eq("id", ownerUserId)
          .maybeSingle()
        const individualApproved =
          String(ownerRow?.noah_kyc_status ?? "").toLowerCase() === "approved"
        if (!individualApproved) {
          const personUpdate = parseNoahCustomerForUsers(customer, { occurredAt: options?.occurredAt })
          if (Object.keys(personUpdate).length > 1) {
            await admin
              .from("users")
              .update({ ...personUpdate, updated_at: now })
              .eq("id", ownerUserId)
          }
        }
      }
    }
    return
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
}
