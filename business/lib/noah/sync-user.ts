import { createSupabaseAdmin } from "@/lib/supabase/admin"
import { mapNoahVerificationToKycStatus } from "./map-kyc"

export async function syncNoahCustomerToSupabase(
  target: { kind: "individual"; userId: string } | { kind: "business"; businessId: string },
  customer: Record<string, unknown>,
  customerId: string,
): Promise<void> {
  const admin = createSupabaseAdmin()
  const kyc = mapNoahVerificationToKycStatus(customer)

  if (target.kind === "business") {
    await admin
      .from("businesses")
      .update({
        noah_customer_id: customerId,
        noah_kyb_status: kyc,
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
      updated_at: new Date().toISOString(),
    })
    .eq("id", target.userId)
}
