import { NextResponse } from "next/server"
import {
  fetchNoahCustomerWithIndividualFallback,
  isNoahCustomerNotFoundError,
  NoahCustomerNotFoundAfterTriesError,
} from "@/lib/noah/fetch-customer"
import { noahFetch } from "@/lib/noah/http"
import { syncNoahCustomerToSupabase } from "@/lib/noah/sync-user"
import { requireAuth, requireNoahEnv, resolveNoahContextAsync } from "../_helpers"
import { mapNoahVerificationToKycStatus } from "@/lib/noah/map-kyc"
import { extractNoahRejectionReasons } from "@/lib/noah/rejection-reasons"
import { needsNoahFiatVirtualAccountProvision } from "@/lib/noah/needs-account-provision"
import { provisionNoahAfterVerificationApproved } from "@/lib/noah/provision-after-approval"
import { createSupabaseAdmin } from "@/lib/supabase/admin"

async function runSyncFromNoah(request: Request) {
  const mis = requireNoahEnv()
  if (mis) return mis
  const auth = await requireAuth(request)
  if ("error" in auth) return auth.error
  const { user } = auth

  const ctx = await resolveNoahContextAsync(user.id, request)
  if (!ctx.ok) return ctx.response

  try {
    const { customer, resolvedCustomerId } =
      ctx.scope === "individual"
        ? await fetchNoahCustomerWithIndividualFallback(user.id, ctx.noahCustomerId)
        : {
            customer: await noahFetch<Record<string, unknown>>({
              method: "GET",
              path: `/customers/${encodeURIComponent(ctx.noahCustomerId)}`,
            }),
            resolvedCustomerId: ctx.noahCustomerId,
          }
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
      provisioned = await provisionNoahAfterVerificationApproved({
        admin,
        scope: ctx.scope,
        noahCustomerId: resolvedCustomerId,
        subjectUserId: user.id,
        subjectBusinessId: ctx.businessId,
      })
    }

    const needsFiatAccountsAfter =
      kyc === "approved"
        ? await needsNoahFiatVirtualAccountProvision(admin, {
            scope: ctx.scope,
            subjectUserId: user.id,
            subjectBusinessId: ctx.businessId,
          })
        : false

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
