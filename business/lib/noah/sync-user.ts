import { createSupabaseAdmin } from "@/lib/supabase/admin"
import { mapNoahVerificationToKycStatus } from "./map-kyc"
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
    await admin
      .from("businesses")
      .update({
        noah_customer_id: customerId,
        noah_kyb_status: kyc,
        noah_kyb_rejection_reasons: rejectionReasons,
        updated_at: now,
      })
      .eq("id", target.businessId)
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
