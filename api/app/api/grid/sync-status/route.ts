import { NextResponse } from "next/server"
import { createSupabaseAdmin } from "@/lib/supabase/admin"
import {
  attachExistingGridBusinessCustomer,
  ensureGridBusinessCustomer,
  loadGridBusinessProfile,
} from "@/lib/grid/ensure-grid-business-customer"
import { syncGridBusinessKybToSupabase } from "@/lib/grid/sync-kyb"
import { provisionAfterVerificationApproved } from "@/lib/verification/provision-after-approval"
import { resolveGridBusinessProvisionNeeds } from "@/lib/compliance/needs-business-provision"
import { persistVerificationStatus } from "@/lib/compliance/verification-store"
import { gridStatusAfterApplicantSubmitted } from "@/lib/compliance/sumsub-hosted-kyb-status"
import { formatGridApiError } from "@/lib/grid/format-grid-api-error"
import { requireAuth, requireGridEnv, resolveGridBusinessContextAsync } from "../_helpers"

export const runtime = "nodejs"
export const maxDuration = 60

async function readStoredGridCustomerId(admin: ReturnType<typeof createSupabaseAdmin>, businessId: string) {
  const { data } = await admin
    .from("businesses")
    .select("grid_customer_id,verification_status")
    .eq("id", businessId)
    .maybeSingle()
  return {
    customerId: String(data?.grid_customer_id ?? "").trim() || null,
    verificationStatus: String(data?.verification_status ?? "not_started").toLowerCase(),
  }
}

async function runGridBusinessSync(request: Request) {
  const mis = requireGridEnv()
  if (mis) return mis
  const auth = await requireAuth(request)
  if ("error" in auth) return auth.error

  const ctx = await resolveGridBusinessContextAsync(auth.user.id)
  if (!ctx.ok) return ctx.response

  const applicantSubmitted =
    request.method === "POST" &&
    ((await request.json().catch(() => ({}))) as { applicantSubmitted?: boolean }).applicantSubmitted ===
      true

  const admin = createSupabaseAdmin()
  const stored = await readStoredGridCustomerId(admin, ctx.businessId)
  const profile = await loadGridBusinessProfile(admin, ctx.businessId)
  if (!profile) {
    return NextResponse.json({ success: false, error: "Business organization not found" }, { status: 404 })
  }

  let customerId = stored.customerId
  if (!customerId) {
    const attached = await attachExistingGridBusinessCustomer({
      admin,
      userId: ctx.userId,
      businessId: ctx.businessId,
      profile,
    }).catch((e) => {
      console.warn("[grid/sync-status] attach existing Grid customer failed:", e)
      return null
    })
    customerId = attached?.customerId ?? null
  }

  // Do not create a Grid customer from background poll.
  if (!customerId) {
    return NextResponse.json({
      success: true,
      skipped: true,
      reason: "no_grid_customer",
      kycStatus: stored.verificationStatus || "not_started",
    })
  }

  try {
    const { customerId } = await ensureGridBusinessCustomer({
      admin,
      userId: ctx.userId,
      businessId: ctx.businessId,
      profile,
    })

    let { status } = await syncGridBusinessKybToSupabase({
      admin,
      businessId: ctx.businessId,
      userId: ctx.userId,
      customerId,
    })
    if (applicantSubmitted && status !== "in_progress") {
      const next = gridStatusAfterApplicantSubmitted(status)
      if (next !== status) {
        await persistVerificationStatus(admin, {
          kind: "business",
          businessId: ctx.businessId,
          userId: ctx.userId,
          provider: "grid",
          status: next as "pending",
          gridCustomerId: customerId,
        })
        status = next as typeof status
      }
    }

    let provisioned: Record<string, unknown> | undefined
    if (status === "approved") {
      provisioned = await provisionAfterVerificationApproved({
        admin,
        scope: "business",
        subjectUserId: ctx.userId,
        subjectBusinessId: ctx.businessId,
        partnerCustomerId: customerId,
        provider: "grid",
      })
    }

    const provisionNeeds =
      status === "approved"
        ? await resolveGridBusinessProvisionNeeds(admin, {
            businessId: ctx.businessId,
            userId: ctx.userId,
          })
        : { needsTurnkeyVaults: false, needsUsdVirtualAccount: false }

    const needsFiatAccountsAfter =
      status === "approved" &&
      (provisionNeeds.needsTurnkeyVaults || provisionNeeds.needsUsdVirtualAccount)

    const provisionHint =
      provisionNeeds.needsTurnkeyVaults && provisionNeeds.needsUsdVirtualAccount
        ? "KYB is approved but your wallet and USD bank receive details are still provisioning. Retry sync in a moment."
        : provisionNeeds.needsTurnkeyVaults
          ? "KYB is approved but your Turnkey wallet is still provisioning. Retry sync in a moment."
          : provisionNeeds.needsUsdVirtualAccount
            ? "KYB is approved but USD bank receive details are still provisioning. Retry sync in a moment."
            : undefined

    return NextResponse.json({
      success: true,
      kycStatus: status,
      provisioned,
      needsFiatAccounts: needsFiatAccountsAfter,
      needsTurnkeyVaults: provisionNeeds.needsTurnkeyVaults,
      needsUsdVirtualAccount: provisionNeeds.needsUsdVirtualAccount,
      fiatAccountsProvisionAttempted: status === "approved",
      ...(provisionHint ? { hint: provisionHint } : {}),
    })
  } catch (e: unknown) {
    const msg = formatGridApiError(e)
    return NextResponse.json({ success: false, error: msg, code: "GRID_SYNC_FAILED" }, { status: 400 })
  }
}

export async function GET(request: Request) {
  return runGridBusinessSync(request)
}

export async function POST(request: Request) {
  return runGridBusinessSync(request)
}
