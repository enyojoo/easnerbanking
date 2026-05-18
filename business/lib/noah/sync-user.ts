import { createSupabaseAdmin } from "@/lib/supabase/admin"
import { mapNoahVerificationToKycStatus } from "./map-kyc"
import { extractNoahRejectionReasons } from "./rejection-reasons"

/**
 * Persist Noah customer id + mapped KYC/KYB status (+ decline reasons when rejected).
 * Do not set `users.full_name` (or any profile PII) from Noah — that stays on `public.users` via profile / bootstrap.
 */
export async function syncNoahCustomerToSupabase(
  target: { kind: "individual"; userId: string } | { kind: "business"; businessId: string },
  customer: Record<string, unknown>,
  customerId: string,
): Promise<void> {
  const admin = createSupabaseAdmin()
  const kyc = mapNoahVerificationToKycStatus(customer)
  const rejectionReasons = kyc === "rejected" ? extractNoahRejectionReasons(customer) : null

  if (target.kind === "business") {
    await admin
      .from("businesses")
      .update({
        noah_customer_id: customerId,
        noah_kyb_status: kyc,
        noah_kyb_rejection_reasons: rejectionReasons,
        updated_at: new Date().toISOString(),
      })
      .eq("id", target.businessId)
    return
  }

  await admin
    .from("users")
    .update({
      noah_customer_id: customerId,
      noah_kyc_status: kyc,
      noah_kyc_rejection_reasons: rejectionReasons,
      updated_at: new Date().toISOString(),
    })
    .eq("id", target.userId)
}
