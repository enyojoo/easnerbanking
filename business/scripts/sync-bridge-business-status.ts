/**
 * Pull Bridge KYB status for one business and persist it.
 * Usage: npx tsx --env-file=.env.local scripts/sync-bridge-business-status.ts <businessId>
 */
import { createSupabaseAdmin } from "@/lib/supabase/admin"
import { findBridgeCustomerByEmail, getBridgeCustomer, resolveBridgeCustomerKycStatus } from "@/lib/bridge/kyc-links"
import { persistVerificationStatus } from "@/lib/compliance/verification-store"
import { provisionBridgeVirtualAccounts } from "@/lib/bridge/provision-after-approval"
import { resolveOrgOwnerUserId } from "@/lib/business/org-owner"

const businessId = String(process.argv[2] ?? "").trim()
if (!businessId) {
  console.error("Usage: tsx scripts/sync-bridge-business-status.ts <businessId>")
  process.exit(1)
}

async function main() {
  const admin = createSupabaseAdmin()
  const { data: biz, error } = await admin
    .from("businesses")
    .select("id,bridge_customer_id,bridge_kyc_status,bridge_tos_status")
    .eq("id", businessId)
    .maybeSingle()
  if (error || !biz) {
    console.error("Business not found")
    process.exit(1)
  }

  let customerId = String(biz.bridge_customer_id ?? "").trim()
  const storedStatus = String(biz.bridge_kyc_status ?? "").trim() || "empty"
  console.log("stored_bridge_kyc_status", storedStatus)
  console.log("has_bridge_customer_id", Boolean(customerId))
  console.log("stored_tos", String(biz.bridge_tos_status ?? "").trim() || "empty")

  if (!customerId) {
    const ownerId = await resolveOrgOwnerUserId(admin, businessId, "")
    const { data: owner } = await admin.from("users").select("email").eq("id", ownerId).maybeSingle()
    const email = String(owner?.email ?? "").trim()
    const found = email ? await findBridgeCustomerByEmail(email, "business").catch(() => null) : null
    customerId = String(found?.id ?? "").trim()
    console.log("looked_up_business_customer", Boolean(customerId))
  }

  if (!customerId) {
    console.error("No Bridge business customer to sync")
    process.exit(2)
  }

  const customer = await getBridgeCustomer(customerId)
  const mapped = resolveBridgeCustomerKycStatus(customer)
  const endorsements = (customer.endorsements ?? []).map((row) => `${row.name}:${row.status}`).join(",")
  console.log("bridge_kyc_status", String(customer.kyc_status ?? "").trim() || "empty")
  console.log("bridge_tos_status", String(customer.tos_status ?? "").trim() || "empty")
  console.log("bridge_platform_status", String(customer.status ?? "").trim() || "empty")
  console.log("mapped", mapped)
  console.log("endorsements", endorsements || "none")

  const tosOk =
    String(customer.tos_status ?? "").trim().toLowerCase() === "approved" ||
    (customer as { has_accepted_terms_of_service?: boolean }).has_accepted_terms_of_service === true

  const ownerId = await resolveOrgOwnerUserId(admin, businessId, "")
  try {
    await persistVerificationStatus(admin, {
      kind: "business",
      businessId,
      userId: ownerId || businessId,
      provider: "bridge",
      status: mapped,
      bridgeCustomerId: customerId,
      extra: tosOk ? { bridge_tos_status: "approved" } : undefined,
    })
  } catch (error) {
    console.error("persist_failed", error instanceof Error ? error.message : error)
    process.exit(3)
  }

  let provisioned = false
  if (mapped === "approved") {
    const vas = await provisionBridgeVirtualAccounts({
      admin,
      userId: ownerId,
      businessId,
      customerId,
    })
    provisioned = Boolean(vas.usd || vas.eur)
  }
  console.log("persisted", mapped)
  console.log("provisioned", provisioned)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "sync failed")
  process.exit(1)
})
