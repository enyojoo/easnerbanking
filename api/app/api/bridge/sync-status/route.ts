import { NextResponse } from "next/server"
import { createSupabaseAdmin } from "@/lib/supabase/admin"
import { getBridgeCustomer, findBridgeCustomerByEmail, resolveBridgeCustomerKycStatus } from "@/lib/bridge/kyc-links"
import { persistVerificationStatus } from "@/lib/compliance/verification-store"
import { provisionBridgeVirtualAccounts } from "@/lib/bridge/provision-after-approval"
import { persistBridgeCustomerProfile } from "@/lib/bridge/persist-bridge-customer-profile"
import { requireAuth, requireBridgeEnv } from "../_helpers"
import { readAccountScopeFromRequest } from "@/lib/noah/resolve-noah-context"
import { resolveGridBusinessContextAsync } from "@/app/api/grid/_helpers"

export const runtime = "nodejs"

export async function POST(request: Request) {
  const mis = requireBridgeEnv()
  if (mis) return mis
  const auth = await requireAuth(request)
  if ("error" in auth) return auth.error
  const { user } = auth
  const admin = createSupabaseAdmin()
  const scope = readAccountScopeFromRequest(request)

  let businessId: string | null = null
  let customerId = ""
  if (scope === "business") {
    const ctx = await resolveGridBusinessContextAsync(user.id)
    if (!ctx.ok) return ctx.response
    businessId = ctx.businessId
    const { data } = await admin
      .from("businesses")
      .select("bridge_customer_id,bridge_kyc_status")
      .eq("id", businessId)
      .maybeSingle()
    customerId = String(data?.bridge_customer_id ?? "").trim()
    if (!customerId) {
      const email = String(user.email ?? "").trim()
      const found = email
        ? await findBridgeCustomerByEmail(email, "business").catch(() => null)
        : null
      customerId = String(found?.id ?? "").trim()
    }
  } else {
    const { data } = await admin
      .from("users")
      .select("bridge_customer_id,bridge_kyc_status,email")
      .eq("id", user.id)
      .maybeSingle()
    customerId = String(data?.bridge_customer_id ?? "").trim()
    if (!customerId) {
      const email = String(data?.email ?? user.email ?? "").trim()
      const found = email
        ? await findBridgeCustomerByEmail(email, "individual").catch(() => null)
        : null
      customerId = String(found?.id ?? "").trim()
    }
  }

  if (!customerId) {
    return NextResponse.json({ kyc_status: "not_started", provisioned: false })
  }

  const customer = await getBridgeCustomer(customerId)
  const status = resolveBridgeCustomerKycStatus(customer)

  if (businessId) {
    await persistVerificationStatus(admin, {
      kind: "business",
      businessId,
      userId: user.id,
      provider: "bridge",
      status,
      bridgeCustomerId: customerId,
      extra:
        String(customer.tos_status ?? "").toLowerCase() === "approved"
          ? { bridge_tos_status: "approved" }
          : undefined,
    })
  } else {
    await persistVerificationStatus(admin, {
      kind: "individual",
      userId: user.id,
      provider: "bridge",
      status,
      bridgeCustomerId: customerId,
    })
    await admin
      .from("users")
      .update({
        bridge_customer_id: customerId,
        bridge_kyc_status: status,
        updated_at: new Date().toISOString(),
      })
      .eq("id", user.id)
  }

  await persistBridgeCustomerProfile(admin, {
    customer: customer as Record<string, unknown>,
    status,
    userId: user.id,
    businessId,
  }).catch((error) => {
    console.warn("[bridge] customer profile persist failed", error)
  })

  let provisioned = false
  if (status === "approved") {
    const vas = await provisionBridgeVirtualAccounts({
      admin,
      userId: user.id,
      businessId,
      customerId,
    })
    provisioned = vas.usd || vas.eur
  }

  return NextResponse.json({ kyc_status: status, provisioned, customer_id: customerId })
}
