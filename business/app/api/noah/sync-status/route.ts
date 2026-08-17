import { NextResponse } from "next/server"
import {
  fetchNoahCustomerForScope,
  isNoahCustomerNotFoundError,
  NoahCustomerNotFoundAfterTriesError,
} from "@/lib/noah/fetch-customer"
import { syncNoahCustomerToSupabase } from "@/lib/noah/sync-user"
import { requireAuth, requireNoahEnv, resolveNoahContextAsync } from "../_helpers"
import { mapNoahVerificationToKycStatus } from "@/lib/noah/map-kyc"
import { extractNoahRejectionReasons } from "@/lib/noah/rejection-reasons"
import { needsNoahFiatVirtualAccountProvision } from "@/lib/noah/needs-account-provision"
import { provisionAfterVerificationApproved } from "@/lib/verification/provision-after-approval"
import { businessUsesGridVerification } from "@/lib/compliance/business-tier1"
import { resolveGridBusinessProvisionNeeds } from "@/lib/compliance/needs-business-provision"
import { createSupabaseAdmin } from "@/lib/supabase/admin"

export const runtime = "nodejs"
export const maxDuration = 60

async function runSyncFromNoah(request: Request) {
  const mis = requireNoahEnv()
  if (mis) return mis
  const auth = await requireAuth(request)
  if ("error" in auth) return auth.error
  const { user } = auth

  const ctx = await resolveNoahContextAsync(user.id, request)
  if (!ctx.ok) return ctx.response

  try {
    const subjectId = ctx.scope === "business" ? (ctx.businessId ?? ctx.noahCustomerId) : user.id
    const { customer, resolvedCustomerId } = await fetchNoahCustomerForScope(
      ctx.scope,
      subjectId,
      ctx.noahCustomerId,
    )
    await syncNoahCustomerToSupabase(
      ctx.scope === "business" && ctx.businessId
        ? { kind: "business", businessId: ctx.businessId }
        : { kind: "individual", userId: user.id },
      customer,
      resolvedCustomerId,
    )
    const kyc = mapNoahVerificationToKycStatus(customer)
    const rejectionReasons = kyc === "rejected" ? extractNoahRejectionReasons(customer) : null
    const admin = createSupabaseAdmin()
    let provisioned: Record<string, unknown> | undefined
    if (kyc === "approved") {
      let gridCustomerId: string | null = null
      if (ctx.scope === "business" && ctx.businessId) {
        const { data: biz } = await admin
          .from("businesses")
          .select("verification_provider,grid_customer_id")
          .eq("id", ctx.businessId)
          .maybeSingle()
        if (businessUsesGridVerification(biz as { verification_provider?: string | null } | null)) {
          gridCustomerId = String(biz?.grid_customer_id ?? "").trim() || null
        }
      }
      provisioned = await provisionAfterVerificationApproved({
        admin,
        scope: ctx.scope,
        subjectUserId: user.id,
        subjectBusinessId: ctx.businessId,
        partnerCustomerId: gridCustomerId ?? resolvedCustomerId,
        provider: gridCustomerId ? "grid" : undefined,
      })
    }

    let needsFiatAccountsAfter = false
    if (kyc === "approved") {
      if (ctx.scope === "business" && ctx.businessId) {
        const { data: biz } = await admin
          .from("businesses")
          .select("verification_provider")
          .eq("id", ctx.businessId)
          .maybeSingle()
        if (businessUsesGridVerification(biz as { verification_provider?: string | null } | null)) {
          const needs = await resolveGridBusinessProvisionNeeds(admin, {
            businessId: ctx.businessId,
            userId: user.id,
          })
          needsFiatAccountsAfter = needs.needsTurnkeyVaults || needs.needsUsdVirtualAccount
        } else {
          needsFiatAccountsAfter = await needsNoahFiatVirtualAccountProvision(admin, {
            scope: ctx.scope,
            subjectUserId: user.id,
            subjectBusinessId: ctx.businessId,
          })
        }
      } else {
        needsFiatAccountsAfter = await needsNoahFiatVirtualAccountProvision(admin, {
          scope: ctx.scope,
          subjectUserId: user.id,
          subjectBusinessId: ctx.businessId,
        })
      }
    }

    return NextResponse.json({
      success: true,
      noahScope: ctx.scope,
      kycStatus: kyc,
      rejectionReasons,
      provisioned,
      needsFiatAccounts: needsFiatAccountsAfter,
      fiatAccountsProvisionAttempted: kyc === "approved",
      ...(needsFiatAccountsAfter && kyc === "approved"
        ? {
            hint:
              "KYC/KYB is approved but USD/EUR virtual account ids are still missing. Noah may not have issued payment methods yet — retry sync-status in a few minutes or check the Noah dashboard.",
          }
        : {}),
    })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    const notFound =
      e instanceof NoahCustomerNotFoundAfterTriesError || isNoahCustomerNotFoundError(e)
    return NextResponse.json(
      {
        error: msg,
        ...(notFound
          ? {
              code: "NOAH_CUSTOMER_NOT_FOUND" as const,
              noahCustomerId: ctx.noahCustomerId,
              noahScope: ctx.scope,
              ...(e instanceof NoahCustomerNotFoundAfterTriesError
                ? { triedCustomerIds: [...e.attemptedIds] }
                : {}),
              hint:
                "No customer in this Noah environment matches that CustomerID. Typical causes: NOAH_API_BASE_URL must include /v1 (https://api.noah.com/v1); wrong production API key; customer created in a different Noah program; individual vs business scope mismatch; or set users.noah_customer_id to Noah’s exact CustomerID string.",
            }
          : {}),
      },
      { status: notFound ? 404 : 400 },
    )
  }
}

/** GET supported for return-page / links; POST preferred for explicit sync. */
export async function GET(request: Request) {
  return runSyncFromNoah(request)
}

export async function POST(request: Request) {
  return runSyncFromNoah(request)
}
