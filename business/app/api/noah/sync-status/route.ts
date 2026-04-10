import { NextResponse } from "next/server"
import { noahFetch } from "@/lib/noah/http"
import { syncNoahCustomerToSupabase } from "@/lib/noah/sync-user"
import { requireAuth, requireNoahEnv, resolveNoahContextAsync } from "../_helpers"
import { mapNoahVerificationToKycStatus } from "@/lib/noah/map-kyc"
import { provisionNoahArtifactsForCustomer } from "@/lib/noah/provisioning"
import { resolveNoahAccountContext } from "@/lib/noah/resolve-account-context"

async function runSyncFromNoah(request: Request) {
  const mis = requireNoahEnv()
  if (mis) return mis
  const auth = await requireAuth(request)
  if ("error" in auth) return auth.error
  const { user } = auth

  const ctx = await resolveNoahContextAsync(user.id, request)
  if (!ctx.ok) return ctx.response

  try {
    const customer = await noahFetch<Record<string, unknown>>({
      method: "GET",
      path: `/customers/${encodeURIComponent(ctx.noahCustomerId)}`,
    })
    await syncNoahCustomerToSupabase(
      ctx.scope === "business" && ctx.businessId
        ? { kind: "business", businessId: ctx.businessId }
        : { kind: "individual", userId: user.id },
      customer,
      ctx.noahCustomerId,
    )
    const kyc = mapNoahVerificationToKycStatus(customer)
    let provisioned: Record<string, unknown> | undefined
    if (kyc === "approved") {
      const accountCtx = await resolveNoahAccountContext(request, user.id)
      if (accountCtx.ok) {
        provisioned = await provisionNoahArtifactsForCustomer({
          subjectUserId: accountCtx.ctx.subjectUserId,
          subjectBusinessId: accountCtx.ctx.subjectBusinessId,
          noahCustomerId: accountCtx.ctx.noahCustomerId,
          scope: accountCtx.ctx.scope,
        })
      }
    }
    return NextResponse.json({
      success: true,
      noahScope: ctx.scope,
      kycStatus: kyc,
      provisioned,
    })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    const notFound = /not\s*found/i.test(msg)
    return NextResponse.json(
      {
        error: msg,
        ...(notFound
          ? {
              code: "NOAH_CUSTOMER_NOT_FOUND" as const,
              noahCustomerId: ctx.noahCustomerId,
              noahScope: ctx.scope,
              hint:
                "No customer in this Noah environment matches that CustomerID. Typical causes: customer not created yet; wrong sandbox vs production API URL/key; individual vs business scope mismatch; or Noah’s CustomerID differs from Easner’s (set users.noah_customer_id / businesses.noah_customer_id to Noah’s ID).",
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
