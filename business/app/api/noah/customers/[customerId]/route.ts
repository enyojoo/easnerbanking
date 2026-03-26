import { NextResponse } from "next/server"
import { noahFetch } from "@/lib/noah/http"
import { parseNoahScopeFromPathCustomerId } from "@/lib/noah/customer-id"
import { syncNoahCustomerToSupabase } from "@/lib/noah/sync-user"
import { requireAuth, requireNoahEnv } from "../../_helpers"

type Ctx = { params: Promise<{ customerId: string }> }

export async function GET(request: Request, ctx: Ctx) {
  const mis = requireNoahEnv()
  if (mis) return mis
  const auth = await requireAuth(request)
  if ("error" in auth) return auth.error
  const { user } = auth
  const { customerId } = await ctx.params

  const scope = parseNoahScopeFromPathCustomerId(user.id, customerId)
  if (!scope) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  try {
    const customer = await noahFetch<Record<string, unknown>>({
      method: "GET",
      path: `/customers/${encodeURIComponent(customerId)}`,
    })
    await syncNoahCustomerToSupabase(user.id, customer, customerId, scope)
    return NextResponse.json(customer)
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 400 })
  }
}
