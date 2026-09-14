import { NextResponse } from "next/server"
import { createSupabaseAdmin } from "@/lib/supabase/admin"
import { createBridgeKycLink, mapBridgeKycStatus, pickBridgeKycLinkFullName, bridgeCreateKycLinkIdempotencyKey, getBridgeCustomer, getBridgeHostedLinksForCustomer } from "@/lib/bridge/kyc-links"
import { isBridgeOnboardableResidence } from "@/lib/bridge/geo"
import { persistVerificationStatus } from "@/lib/compliance/verification-store"
import { requireAuth, requireBridgeEnv } from "../_helpers"
import { readAccountScopeFromRequest } from "@/lib/noah/resolve-noah-context"
import { resolveGridBusinessContextAsync } from "@/app/api/grid/_helpers"
import { loadGridBusinessProfile } from "@/lib/grid/ensure-grid-business-customer"

export const runtime = "nodejs"

/**
 * Start hosted Bridge KYC (individuals) or KYB (business). Customer-facing copy never names Bridge.
 */
export async function POST(request: Request) {
  const mis = requireBridgeEnv()
  if (mis) return mis
  const auth = await requireAuth(request)
  if ("error" in auth) return auth.error
  const { user } = auth

  let body: { full_name?: string; email?: string; type?: string } = {}
  try {
    body = await request.json()
  } catch {
    /* empty */
  }

  const admin = createSupabaseAdmin()
  const scope = readAccountScopeFromRequest(request)
  const type = body.type === "business" || scope === "business" ? "business" : "individual"

  const { data: userRow } = await admin
    .from("users")
    .select("full_name,email,residence_country,kyc_address_state,kyc_address_country,bridge_customer_id,bridge_kyc_status")
    .eq("id", user.id)
    .maybeSingle()

  const country = String(userRow?.kyc_address_country ?? userRow?.residence_country ?? "").trim()
  const state = String(userRow?.kyc_address_state ?? "").trim()
  if (type === "individual" && !isBridgeOnboardableResidence({ countryCode: country, state })) {
    return NextResponse.json(
      {
        error: "Bank accounts are not available in your region yet.",
        code: "BRIDGE_GEO_BLOCKED",
      },
      { status: 400 },
    )
  }

  let businessId: string | null = null
  let businessLegalName: string | null = null
  let existingCustomerId = String(userRow?.bridge_customer_id ?? "").trim()
  let existingStatus = ""
  if (type === "business") {
    const ctx = await resolveGridBusinessContextAsync(user.id)
    if (!ctx.ok) return ctx.response
    businessId = ctx.businessId
    const profile = await loadGridBusinessProfile(admin, businessId).catch(() => null)
    businessLegalName = String(profile?.legalName ?? "").trim() || null
    const { data: biz } = await admin
      .from("businesses")
      .select("bridge_customer_id,bridge_kyc_status")
      .eq("id", businessId)
      .maybeSingle()
    existingCustomerId = String(biz?.bridge_customer_id ?? "").trim()
    existingStatus = String(biz?.bridge_kyc_status ?? "").trim()
  } else {
    existingStatus = String(userRow?.bridge_kyc_status ?? "").trim()
  }

  const fullName = pickBridgeKycLinkFullName({
    type,
    businessLegalName,
    personFullName: body.full_name ?? userRow?.full_name,
  })
  const email = String(body.email ?? userRow?.email ?? user.email ?? "").trim()
  if (!email) {
    return NextResponse.json({ error: "Email is required to start verification." }, { status: 400 })
  }

  const existingMapped = mapBridgeKycStatus(existingStatus)
  if (existingCustomerId && existingMapped === "approved") {
    return NextResponse.json({
      kyc_link: null,
      tos_link: null,
      kyc_status: "approved",
      customer_id: existingCustomerId,
    })
  }

  let link: {
    kyc_link?: string | null
    tos_link?: string | null
    kyc_status?: string | null
    customer_id?: string | null
  } | null = null

  if (existingCustomerId) {
    if (type === "business" && businessId) {
      const { prefillBridgeBusinessCustomer } = await import("@/lib/bridge/prefill-from-grid")
      await prefillBridgeBusinessCustomer({
        admin,
        businessId,
        customerId: existingCustomerId,
      }).catch(() => undefined)
    }
    const hosted = await getBridgeHostedLinksForCustomer(existingCustomerId).catch(() => ({
      kyc_link: null,
      tos_link: null,
    }))
    if (hosted.kyc_link || hosted.tos_link) {
      const customer = await getBridgeCustomer(existingCustomerId).catch(() => null)
      link = {
        kyc_link: hosted.tos_link || hosted.kyc_link,
        tos_link: hosted.tos_link,
        kyc_status: customer?.kyc_status ?? customer?.status ?? existingStatus,
        customer_id: existingCustomerId,
      }
    }
  }

  if (!link) {
    link = await createBridgeKycLink({
      fullName,
      email,
      type,
      idempotencyKey: bridgeCreateKycLinkIdempotencyKey({
        type,
        subjectId: businessId ?? user.id,
        fullName,
      }),
    })
  }

  const customerId = String(link.customer_id ?? existingCustomerId).trim()
  if (type === "business" && businessId && customerId && !existingCustomerId) {
    const { prefillBridgeBusinessCustomer } = await import("@/lib/bridge/prefill-from-grid")
    await prefillBridgeBusinessCustomer({
      admin,
      businessId,
      customerId,
    }).catch(() => undefined)
  }
  const status = mapBridgeKycStatus(link.kyc_status)
  if (type === "business" && businessId) {
    await admin
      .from("businesses")
      .update({
        ...(customerId ? { bridge_customer_id: customerId } : {}),
        bridge_kyc_status: status,
        updated_at: new Date().toISOString(),
      })
      .eq("id", businessId)
  } else {
    await persistVerificationStatus(admin, {
      kind: "individual",
      userId: user.id,
      provider: "bridge",
      status: status === "not_started" ? "in_progress" : status,
      bridgeCustomerId: customerId || null,
    })
    await admin
      .from("users")
      .update({
        ...(customerId ? { bridge_customer_id: customerId } : {}),
        bridge_kyc_status: status === "not_started" ? "in_progress" : status,
        updated_at: new Date().toISOString(),
      })
      .eq("id", user.id)
  }

  return NextResponse.json({
    kyc_link: link.kyc_link ?? null,
    tos_link: link.tos_link ?? null,
    kyc_status: status,
    customer_id: customerId || null,
  })
}
