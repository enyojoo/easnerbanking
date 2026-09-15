import { NextResponse } from "next/server"
import { createSupabaseAdmin } from "@/lib/supabase/admin"
import { requireOfficeAdmin } from "@/lib/api/admin-auth"
import { logAdminAction } from "@/lib/admin-audit"
import { persistVerificationStatus } from "@/lib/compliance/verification-store"
import { getBridgeCustomer, findBridgeCustomerByEmail, resolveBridgeCustomerKycStatus } from "@/lib/bridge/kyc-links"
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
    if (!customerId && userId) {
      const { data: owner } = await admin.from("users").select("email").eq("id", userId).maybeSingle()
      const email = String(owner?.email ?? "").trim()
      const found = email
        ? await findBridgeCustomerByEmail(email, "business").catch(() => null)
        : null
      customerId = String(found?.id ?? "").trim()
    }
  } else {
    const { data } = await admin
      .from("users")
      .select("bridge_customer_id,email")
      .eq("id", id)
      .maybeSingle()
    customerId = String(data?.bridge_customer_id ?? "").trim()
    if (!customerId) {
      const email = String(data?.email ?? "").trim()
      const found = email
        ? await findBridgeCustomerByEmail(email, "individual").catch(() => null)
        : null
      customerId = String(found?.id ?? "").trim()
    }
    if (!customerId) {
      const { data: byBridge } = await admin
        .from("users")
        .select("id,bridge_customer_id")
        .eq("bridge_customer_id", id)
        .maybeSingle()
      if (byBridge?.id) {
        userId = byBridge.id
        customerId = String(byBridge.bridge_customer_id ?? id).trim()
      }
    }
    if (!customerId) {
      const remote = await getBridgeCustomer(id).catch(() => null)
      if (remote?.id) {
        customerId = remote.id
        const email = String((remote as { email?: string }).email ?? "").trim()
        if (email) {
          const { data: byEmail } = await admin
            .from("users")
            .select("id")
            .eq("email", email)
            .maybeSingle()
          if (byEmail?.id) userId = byEmail.id
        }
      }
    }
  }

  if (!customerId) {
    return NextResponse.json({ ok: true, kycStatus: "not_started", provisioned: false })
  }

  const customer = await getBridgeCustomer(customerId)
  const status = resolveBridgeCustomerKycStatus(customer)

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
      userId,
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
      .eq("id", userId)
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
