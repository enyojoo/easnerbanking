import { NextResponse } from "next/server"
import { fetchNoahCustomerWithIndividualFallback } from "@/lib/noah/fetch-customer"
import { noahFetch } from "@/lib/noah/http"
import { syncNoahCustomerToSupabase } from "@/lib/noah/sync-user"
import { requireNoahEnv, resolveNoahContextAsync } from "@/app/api/noah/_helpers"
import { requireOfficeAdmin } from "@/lib/api/admin-auth"
import { logAdminAction } from "@/lib/admin-audit"

/**
 * Staff-only: sync Noah customer for a given user id (individual or business scope).
 */
export async function POST(request: Request) {
  const auth = await requireOfficeAdmin(request)
  if (!auth.ok) return auth.response
  const mis = requireNoahEnv()
  if (mis) return mis

  let body: { userId?: string; noahScope?: "individual" | "business" }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }
  const userId = body.userId?.trim()
  if (!userId) {
    return NextResponse.json({ error: "userId required" }, { status: 400 })
  }

  const scope = body.noahScope === "business" ? "business" : "individual"
  const synthetic = new Request("http://local/admin-noah", {
    method: "POST",
    headers: new Headers([["x-easner-noah-scope", scope]]),
  })
  const ctx = await resolveNoahContextAsync(userId, synthetic)
  if (!ctx.ok) return ctx.response

  try {
    const { customer, resolvedCustomerId } =
      ctx.scope === "individual"
        ? await fetchNoahCustomerWithIndividualFallback(userId, ctx.noahCustomerId)
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
        : { kind: "individual", userId },
      customer,
      resolvedCustomerId,
    )
    await logAdminAction(auth.ctx.userId, "noah.sync_kyc", userId, { noahScope: ctx.scope })
    return NextResponse.json({ success: true, noahScope: ctx.scope })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 400 })
  }
}
