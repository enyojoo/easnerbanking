import { NextResponse } from "next/server"
import { noahFetch } from "@/lib/noah/http"
import { customerIdAllowedForSession } from "@/lib/noah/customer-id"
import { mapNoahVerificationToKycStatus } from "@/lib/noah/map-kyc"
import { createSupabaseAdmin } from "@/lib/supabase/admin"
import { requireAuth, requireNoahEnv } from "../../../_helpers"

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
    .select("easner_business_id")
    .eq("id", user.id)
    .maybeSingle()

  const scope = customerIdAllowedForSession({
    sessionUserId: user.id,
    easnerBusinessId: (u?.easner_business_id as string | null) ?? null,
    customerId,
  })
  if (!scope) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  try {
    const customer = await noahFetch<Record<string, unknown>>({
      method: "GET",
      path: `/customers/${encodeURIComponent(customerId)}`,
    })
    return NextResponse.json({
      kycStatus: mapNoahVerificationToKycStatus(customer),
      noahScope: scope,
    })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 400 })
  }
}
