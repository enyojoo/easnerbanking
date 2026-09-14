import { NextResponse } from "next/server"
import { createSupabaseAdmin } from "@/lib/supabase/admin"
import { requireOfficeAdmin } from "@/lib/api/admin-auth"
import { logAdminAction } from "@/lib/admin-audit"
import { persistVerificationStatus } from "@/lib/compliance/verification-store"
import { getBridgeCustomer, mapBridgeKycStatus } from "@/lib/bridge/kyc-links"
import { provisionBridgeVirtualAccounts } from "@/lib/bridge/provision-after-approval"
import { resolveOrgOwnerUserId } from "@/lib/business/org-owner"
import { requireBridgeEnv } from "@/app/api/bridge/_helpers"

function parseKind(raw: string): "user" | "business" | null {
  if (raw === "user" || raw === "business") return raw
  return null
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ kind: string; id: string }> },
) {
  const auth = await requireOfficeAdmin(request)
  if (!auth.ok) return auth.response
  const mis = requireBridgeEnv()
  if (mis) return mis

  const { kind: kindRaw, id } = await params
  const kind = parseKind(kindRaw)
  if (!kind || !id) return NextResponse.json({ error: "Invalid subject" }, { status: 400 })

  const admin = createSupabaseAdmin()
  let customerId = ""
  let businessId: string | null = null
  let userId = id

  if (kind === "business") {
    businessId = id
    const { data } = await admin
      .from("businesses")
      .select("bridge_customer_id")
      .eq("id", id)
      .maybeSingle()
    customerId = String(data?.bridge_customer_id ?? "").trim()
    userId = await resolveOrgOwnerUserId(admin, id, "")
  } else {
    const { data } = await admin
      .from("users")
      .select("bridge_customer_id")
      .eq("id", id)
      .maybeSingle()
    customerId = String(data?.bridge_customer_id ?? "").trim()
  }

  if (!customerId) {
    return NextResponse.json({ ok: true, kycStatus: "not_started", provisioned: false })
  }

  const customer = await getBridgeCustomer(customerId)
  const status = mapBridgeKycStatus(customer.kyc_status ?? customer.status)

  if (kind === "business") {
    await admin
      .from("businesses")
      .update({
        bridge_customer_id: customerId,
        bridge_kyc_status: status,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
  } else {
    await persistVerificationStatus(admin, {
      kind: "individual",
      userId: id,
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
      .eq("id", id)
  }

  let provisioned = false
  if (status === "approved" && userId) {
    const vas = await provisionBridgeVirtualAccounts({
      admin,
      userId,
      businessId,
      customerId,
    })
    provisioned = Boolean(vas.usd || vas.eur)
  }

  await logAdminAction(auth.ctx.userId, "bridge.sync", id, { kind, status, provisioned })
  return NextResponse.json({ ok: true, kycStatus: status, provisioned, customerId })
}
