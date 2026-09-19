import { NextResponse } from "next/server"
import { createSupabaseAdmin } from "@/lib/supabase/admin"
import {
  applyBridgeHostedRedirect,
  createBridgeKycLink,
  mapBridgeKycStatus,
  pickBridgeKycLinkFullName,
  bridgeCreateKycLinkIdempotencyKey,
  getBridgeCustomer,
  getBridgeHostedLinksForCustomer,
  findBridgeCustomerByEmail,
  hostedLinksForExistingCustomer,
  isBridgeTosApproved,
  resolveBridgeCustomerKycStatus,
  shouldPrefillBridgeBusinessCustomer,
} from "@/lib/bridge/kyc-links"
import { getBridgeTosReturnUrl } from "@/lib/bridge/config"
import {
  customerIdFromBridgeError,
  formatBridgeKycStartError,
  isBridgeExistingCustomerError,
} from "@/lib/bridge/format-bridge-api-error"
import { isBridgeOnboardableResidence } from "@/lib/bridge/geo"
import { persistVerificationStatus } from "@/lib/compliance/verification-store"
import { provisionBridgeVirtualAccounts } from "@/lib/bridge/provision-after-approval"
import { requireAuth, requireBridgeEnv } from "../_helpers"
import { readAccountScopeFromRequest } from "@/lib/noah/resolve-noah-context"
import { resolveGridBusinessContextAsync } from "@/app/api/grid/_helpers"
import { loadGridBusinessProfile } from "@/lib/grid/ensure-grid-business-customer"

export const runtime = "nodejs"

type HostedKycPayload = {
  kyc_link?: string | null
  tos_link?: string | null
  kyc_status?: string | null
  customer_id?: string | null
  alreadyOnboarded?: boolean
}

async function hostedPayloadForExistingCustomer(
  customerId: string,
  fallbackStatus: string,
  localTosApproved = false,
  type: "individual" | "business" = "individual",
): Promise<HostedKycPayload> {
  const customer = await getBridgeCustomer(customerId).catch(() => null)
  const hosted = await getBridgeHostedLinksForCustomer(customerId, { type, customer }).catch(() => ({
    kyc_link: null,
    tos_link: null,
  }))
  return hostedLinksForExistingCustomer({
    customerId,
    customer,
    fallbackStatus,
    localTosApproved,
    hosted,
  })
}

/**
 * Start hosted Bridge KYC (individuals) or KYB (business). Customer-facing copy never names Bridge.
 */
export async function POST(request: Request) {
  const mis = requireBridgeEnv()
  if (mis) return mis
  const auth = await requireAuth(request)
  if ("error" in auth) return auth.error
  const { user } = auth

  let body: { full_name?: string; email?: string; type?: string; residenceCountry?: string } = {}
  try {
    body = await request.json()
  } catch {
    /* empty */
  }

  const admin = createSupabaseAdmin()
  const scope = readAccountScopeFromRequest(request)
  const type = body.type === "business" || scope === "business" ? "business" : "individual"

  try {
  const { data: userRow } = await admin
    .from("users")
    .select("full_name,email,residence_country,kyc_address_state,kyc_address_country,bridge_customer_id,bridge_kyc_status,bridge_tos_status")
    .eq("id", user.id)
    .maybeSingle()

  const country = String(
    body.residenceCountry ?? userRow?.kyc_address_country ?? userRow?.residence_country ?? "",
  ).trim()
  const state = String(userRow?.kyc_address_state ?? "").trim()
  if (type === "individual" && !isBridgeOnboardableResidence({ countryCode: country, state })) {
    return NextResponse.json(
      {
        error: country
          ? "Bank accounts are not available in your region yet."
          : "Select your country of residence to start verification.",
        code: "BRIDGE_GEO_BLOCKED",
      },
      { status: 400 },
    )
  }

  let businessId: string | null = null
  let businessLegalName: string | null = null
  let existingCustomerId = String(userRow?.bridge_customer_id ?? "").trim()
  let existingStatus = ""
  let localTosApproved = isBridgeTosApproved({
    tos_status: (userRow as { bridge_tos_status?: string | null } | null)?.bridge_tos_status,
  })
  if (type === "business") {
    const ctx = await resolveGridBusinessContextAsync(user.id)
    if (!ctx.ok) return ctx.response
    businessId = ctx.businessId
    const profile = await loadGridBusinessProfile(admin, businessId).catch(() => null)
    const { data: biz } = await admin
      .from("businesses")
      .select("bridge_customer_id,bridge_kyc_status,bridge_tos_status,name")
      .eq("id", businessId)
      .maybeSingle()
    existingCustomerId = String(biz?.bridge_customer_id ?? "").trim()
    existingStatus = String(biz?.bridge_kyc_status ?? "").trim()
    localTosApproved = isBridgeTosApproved({ tos_status: biz?.bridge_tos_status })
    businessLegalName =
      String(profile?.legalName ?? "").trim() || String(biz?.name ?? "").trim() || null
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

  if (existingCustomerId && type === "business") {
    const attached = await getBridgeCustomer(existingCustomerId).catch(() => null)
    if (String(attached?.type ?? "").toLowerCase() === "individual") {
      existingCustomerId = ""
      existingStatus = ""
    }
  }

  const existingMapped = mapBridgeKycStatus(existingStatus)
  if (existingCustomerId && existingMapped === "approved") {
    return NextResponse.json({
      kyc_link: null,
      tos_link: null,
      kyc_status: "approved",
      customer_id: existingCustomerId,
      alreadyOnboarded: true,
    })
  }

  if (!existingCustomerId) {
    const found = await findBridgeCustomerByEmail(email, type).catch(() => null)
    if (found?.id && found.type === type) {
      existingCustomerId = found.id
      existingStatus = resolveBridgeCustomerKycStatus(found)
    }
  }

  let link: HostedKycPayload | null = null

  if (existingCustomerId) {
    if (type === "business" && businessId && shouldPrefillBridgeBusinessCustomer(existingStatus)) {
      const { prefillBridgeBusinessCustomer } = await import("@/lib/bridge/prefill-from-grid")
      await prefillBridgeBusinessCustomer({
        admin,
        businessId,
        customerId: existingCustomerId,
      }).catch(() => undefined)
    }
    link = await hostedPayloadForExistingCustomer(
      existingCustomerId,
      existingStatus,
      localTosApproved,
      type,
    )
  }

  if (!link) {
    try {
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
    } catch (createError) {
      const recoveredId =
        customerIdFromBridgeError(createError) ||
        (isBridgeExistingCustomerError(createError)
          ? (await findBridgeCustomerByEmail(email, type).catch(() => null))?.id
          : null)
      if (!recoveredId) throw createError
      existingCustomerId = recoveredId
      link = await hostedPayloadForExistingCustomer(
        recoveredId,
        existingStatus,
        localTosApproved,
        type,
      )
    }
  }

  const customerId = String(link.customer_id ?? existingCustomerId).trim()
  if (
    type === "business" &&
    businessId &&
    customerId &&
    shouldPrefillBridgeBusinessCustomer(existingStatus)
  ) {
    const { prefillBridgeBusinessCustomer } = await import("@/lib/bridge/prefill-from-grid")
    await prefillBridgeBusinessCustomer({
      admin,
      businessId,
      customerId,
    }).catch(() => undefined)
  }
  const status = resolveBridgeCustomerKycStatus({ kyc_status: link.kyc_status })
  const persistStatus = status === "not_started" && customerId ? "in_progress" : status
  if (type === "business" && businessId) {
    try {
      await persistVerificationStatus(admin, {
        kind: "business",
        businessId,
        userId: user.id,
        provider: "bridge",
        status: persistStatus,
        bridgeCustomerId: customerId || null,
      })
    } catch (persistError) {
      console.warn("[bridge/kyc-links] persist business KYB failed:", persistError)
    }
  } else {
    try {
      await persistVerificationStatus(admin, {
        kind: "individual",
        userId: user.id,
        provider: "bridge",
        status: persistStatus,
        bridgeCustomerId: customerId || null,
      })
    } catch (persistError) {
      console.warn("[bridge/kyc-links] persist individual KYC failed:", persistError)
    }
    const { error } = await admin
      .from("users")
      .update({
        ...(customerId ? { bridge_customer_id: customerId } : {}),
        bridge_kyc_status: persistStatus,
        updated_at: new Date().toISOString(),
      })
      .eq("id", user.id)
    if (error) {
      console.warn("[bridge/kyc-links] persist user KYC columns failed:", error.message)
    }
  }

  if (status === "approved" && customerId) {
    await provisionBridgeVirtualAccounts({
      admin,
      userId: user.id,
      businessId,
      customerId,
    }).catch((error) => {
      console.warn("[bridge/kyc-links] provision after existing customer attach failed:", error)
    })
  }

  const tosApproved = localTosApproved || isBridgeTosApproved(link)
  return NextResponse.json({
    kyc_link: link.kyc_link ?? null,
    tos_link: tosApproved
      ? null
      : applyBridgeHostedRedirect(link.tos_link, getBridgeTosReturnUrl(), { overwrite: true }),
    kyc_status: persistStatus,
    customer_id: customerId || null,
    alreadyOnboarded: Boolean(link.alreadyOnboarded) || status === "approved",
  })
  } catch (e: unknown) {
    const msg = formatBridgeKycStartError(e)
    console.warn("[bridge/kyc-links] hosted KYC start failed:", msg, e)
    return NextResponse.json({ error: msg }, { status: 502 })
  }
}
