import { NextResponse } from "next/server"
import { noahFetch } from "@/lib/noah/http"
import { mapNoahVerificationToKycStatus } from "@/lib/noah/map-kyc"
import { syncNoahCustomerToSupabase } from "@/lib/noah/sync-user"
import { requireAuth, requireNoahEnv, resolveNoahContext } from "../_helpers"

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
    return NextResponse.json({
      success: true,
      synced: true,
      noahScope: ctx.scope,
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
