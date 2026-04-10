import { NextResponse } from "next/server"
import { noahFetch } from "@/lib/noah/http"
import { customerIdAllowedForSession } from "@/lib/noah/customer-id"
import { syncNoahCustomerToSupabase } from "@/lib/noah/sync-user"
import { createSupabaseAdmin } from "@/lib/supabase/admin"
import { requireAuth, requireNoahEnv } from "../../_helpers"

type Ctx = { params: Promise<{ customerId: string }> }

export async function GET(request: Request, ctx: Ctx) {
  const mis = requireNoahEnv()
  if (mis) return mis
  const auth = await requireAuth(request)
  if ("error" in auth) return auth.error
  const { user } = auth
  const { customerId } = await ctx.params

  const admin = createSupabaseAdmin()
  const { data: u } = await admin
    .from("users")
    .select("easner_business_id, noah_customer_id")
    .eq("id", user.id)
    .maybeSingle()

  const easnerBusinessId = (u?.easner_business_id as string | null) ?? null
  let businessStoredNoahId: string | null = null
  if (easnerBusinessId) {
    const { data: b } = await admin
      .from("businesses")
      .select("noah_customer_id")
      .eq("id", easnerBusinessId)
      .maybeSingle()
    businessStoredNoahId = (b?.noah_customer_id as string | null) ?? null
  }

  const scope = customerIdAllowedForSession({
    sessionUserId: user.id,
    easnerBusinessId,
    customerId,
    userStoredNoahCustomerId: (u?.noah_customer_id as string | null) ?? null,
    businessStoredNoahCustomerId: businessStoredNoahId,
  })
  if (!scope) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  try {
    const customer = await noahFetch<Record<string, unknown>>({
      method: "GET",
      path: `/customers/${encodeURIComponent(customerId)}`,
    })
    await syncNoahCustomerToSupabase(
      scope === "business" && u?.easner_business_id
        ? { kind: "business", businessId: u.easner_business_id as string }
        : { kind: "individual", userId: user.id },
      customer,
      customerId,
    )
    return NextResponse.json(customer)
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 400 })
  }
}
