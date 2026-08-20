import { NextResponse } from "next/server"
import { createSupabaseAdmin } from "@/lib/supabase/admin"
import { evaluateGridBusinessKycLinksPreflight } from "@/lib/grid/kyc-links-preflight"
import {
  ensureGridBusinessCustomer,
  loadGridBusinessProfile,
} from "@/lib/grid/ensure-grid-business-customer"
import { createGridBusinessKycLink } from "@/lib/grid/kyc-links"
import {
  fetchGridDocumentsForKyb,
  fetchGridVerificationsForCustomer,
  gridBusinessKybStatus,
  syncGridBusinessKybToSupabase,
} from "@/lib/grid/sync-kyb"
import {
  persistVerificationStatus,
  resetBusinessKybToNotStarted,
} from "@/lib/compliance/verification-store"
import { formatHostedKybStartError } from "@/lib/grid/format-grid-api-error"
import { isGridCustomerNotFoundError } from "@/lib/grid/find-grid-customer"
import { requireAuth, requireGridEnv, resolveGridBusinessContextAsync } from "../_helpers"

function kybLinkIdempotencyKey(businessId: string, refresh: boolean): string {
  if (!refresh) return `kyb-link:${businessId}`
  // Fresh token for the same customer when SumSub asks to refresh an expired one.
  return `kyb-link:${businessId}:r:${Math.floor(Date.now() / 600_000)}`
}

export async function POST(request: Request) {
  const mis = requireGridEnv()
  if (mis) return mis
  const auth = await requireAuth(request)
  if ("error" in auth) return auth.error

  const ctx = await resolveGridBusinessContextAsync(auth.user.id)
  if (!ctx.ok) return ctx.response

  const body = (await request.json().catch(() => ({}))) as { type?: string; refresh?: boolean }
  const refresh = body.refresh === true

  const admin = createSupabaseAdmin()
  const preflight = await evaluateGridBusinessKycLinksPreflight({
    admin,
    businessId: ctx.businessId,
  })
  if (preflight.action === "respond") return preflight.response

  const profile = await loadGridBusinessProfile(admin, ctx.businessId)
  if (!profile) {
    return NextResponse.json({ error: "Business organization not found" }, { status: 404 })
  }

  try {
    const ensured = await ensureGridBusinessCustomer({
      admin,
      userId: ctx.userId,
      businessId: ctx.businessId,
      profile,
    })
    const { customerId, customer } = ensured

    if (preflight.action === "skipHostedPost") {
      await syncGridBusinessKybToSupabase({
        admin,
        businessId: ctx.businessId,
        userId: ctx.userId,
        customerId,
      })
      return NextResponse.json({
        kyc_link: null,
        kyc_status: preflight.kycStatus || "pending",
        customer_id: customerId,
        kyc_link_id: customerId,
        alreadyOnboarded: true,
        canResubmit: true,
      })
    }

    const verifications = await fetchGridVerificationsForCustomer(customerId)
    const documents = await fetchGridDocumentsForKyb(
      customerId,
      customer as Record<string, unknown>,
    )
    const kycStatus = gridBusinessKybStatus(
      customer as Record<string, unknown>,
      verifications,
      documents,
    )
    if (kycStatus === "in_progress" || kycStatus === "pending" || kycStatus === "hold") {
      await syncGridBusinessKybToSupabase({
        admin,
        businessId: ctx.businessId,
        userId: ctx.userId,
        customerId,
        customer: customer as Record<string, unknown>,
      })
    } else {
      // Fresh UNVERIFIED creates used to skip this – Grid got a customer, the business row did not.
      await persistVerificationStatus(admin, {
        kind: "business",
        businessId: ctx.businessId,
        userId: ctx.userId,
        provider: "grid",
        status: kycStatus,
        gridCustomerId: customerId,
      })
    }

    const link = await createGridBusinessKycLink({
      customerId,
      idempotencyKey: kybLinkIdempotencyKey(ctx.businessId, refresh),
    })

    return NextResponse.json({
      kyc_link: link.kycUrl,
      kyc_token: link.token ?? null,
      kyc_status: kycStatus,
      customer_id: customerId,
      kyc_link_id: customerId,
      alreadyOnboarded: false,
      canResubmit: true,
      expiresAt: link.expiresAt ?? null,
    })
  } catch (e: unknown) {
    const msg = formatHostedKybStartError(e)
    console.warn("[grid/kyc-links] hosted KYB start failed:", msg, e)
    if (isGridCustomerNotFoundError(e)) {
      try {
        await resetBusinessKybToNotStarted(admin, ctx.businessId)
      } catch (resetError) {
        console.warn("[grid/kyc-links] failed to reset stale KYB status:", resetError)
      }
      return NextResponse.json(
        {
          error: msg,
          code: "CUSTOMER_NOT_FOUND",
          kyc_status: "not_started",
        },
        { status: 400 },
      )
    }
    return NextResponse.json({ error: msg, code: "GRID_KYB_START_FAILED" }, { status: 400 })
  }
}
