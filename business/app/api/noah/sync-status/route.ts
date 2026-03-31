import { NextResponse } from "next/server"
import { noahFetch } from "@/lib/noah/http"
import { mapNoahVerificationToKycStatus } from "@/lib/noah/map-kyc"
import { syncNoahCustomerToSupabase } from "@/lib/noah/sync-user"
import { requireAuth, requireNoahEnv, resolveNoahContext } from "../_helpers"
import { provisionNoahArtifactsForCustomer } from "@/lib/noah/provisioning"
import { resolveNoahAccountContext } from "@/lib/noah/resolve-account-context"

async function runSyncStatus(request: Request) {
  const mis = requireNoahEnv()
  if (mis) return mis
  const auth = await requireAuth(request)
  if ("error" in auth) return auth.error
  const { user } = auth
  const ctx = resolveNoahContext(user.id, request)

  try {
    const customer = await noahFetch<Record<string, unknown>>({
      method: "GET",
      path: `/customers/${encodeURIComponent(ctx.noahCustomerId)}`,
    })
    await syncNoahCustomerToSupabase(user.id, customer, ctx.noahCustomerId, ctx.scope)
    const kyc = mapNoahVerificationToKycStatus(customer)
    let provisioned: Record<string, unknown> | undefined
    if (kyc === "approved") {
      const accountCtx = await resolveNoahAccountContext(request, user.id)
      if (accountCtx.ok) {
        provisioned = await provisionNoahArtifactsForCustomer({
          subjectUserId: accountCtx.ctx.subjectUserId,
          noahCustomerId: accountCtx.ctx.noahCustomerId,
          scope: accountCtx.ctx.scope,
        })
      }
    }
    return NextResponse.json({
      success: true,
      synced: true,
      noahScope: ctx.scope,
      provisioned,
      data: {
        kycStatus: kyc,
        rejectionReasons: [],
      },
    })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 400 })
  }
}

export async function GET(request: Request) {
  return runSyncStatus(request)
}

export async function POST(request: Request) {
  return runSyncStatus(request)
}
