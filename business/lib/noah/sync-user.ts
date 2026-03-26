import { createSupabaseAdmin } from "@/lib/supabase/admin"
import type { NoahCustomerScope } from "./customer-id"
import { mapNoahVerificationToKycStatus } from "./map-kyc"

export async function syncNoahCustomerToSupabase(
  userId: string,
  customer: Record<string, unknown>,
  customerId: string,
  scope: NoahCustomerScope = "individual"
): Promise<void> {
  const admin = createSupabaseAdmin()
  const kyc = mapNoahVerificationToKycStatus(customer)

  if (scope === "business") {
    await admin
      .from("users")
      .update({
        noah_kyb_customer_id: customerId,
        noah_kyb_status: kyc,
        updated_at: new Date().toISOString(),
      })
      .eq("id", userId)
    return
  }

  await admin
    .from("users")
    .update({
      noah_customer_id: customerId,
      noah_kyc_status: kyc,
      updated_at: new Date().toISOString(),
    })
    .eq("id", userId)
}
