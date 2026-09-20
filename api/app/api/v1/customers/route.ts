import { NextResponse } from "next/server"
import { createPlatformCustomer, publicCustomer } from "@/lib/platform/objects"
import { denyIfRestricted, logPlatformApi, requireMerchant, v1Error } from "@/lib/platform/v1"
import { createSupabaseAdmin } from "@/lib/supabase/admin"

export async function GET(request: Request) {
  const admin = createSupabaseAdmin()
  const auth = await requireMerchant(admin, request, "accounts.read")
  if (!auth.ok) return auth.response
  const livemode = auth.ctx.mode === "live"
  const { data } = await admin
    .from("platform_customers")
    .select("id, email, name, external_id, status, livemode, created_at")
    .eq("business_id", auth.ctx.businessId)
    .eq("livemode", livemode)
    .order("created_at", { ascending: false })
    .limit(100)
  await logPlatformApi(admin, {
    businessId: auth.ctx.businessId,
    livemode,
    method: "GET",
    path: "/v1/customers",
    status: 200,
  })
  return NextResponse.json({ data: (data ?? []).map((row) => publicCustomer(row)) })
}

export async function POST(request: Request) {
  const admin = createSupabaseAdmin()
  const auth = await requireMerchant(admin, request, "transfers.write")
  if (!auth.ok) return auth.response
  const restricted = await denyIfRestricted(admin, auth.ctx.businessId, "send")
  if (restricted) return restricted
  const livemode = auth.ctx.mode === "live"
  const body = (await request.json().catch(() => null)) as {
    email?: string
    name?: string
    external_id?: string
  } | null
  try {
    const customer = await createPlatformCustomer(admin, {
      businessId: auth.ctx.businessId,
      livemode,
      email: body?.email,
      name: body?.name,
      externalId: body?.external_id,
    })
    await logPlatformApi(admin, {
      businessId: auth.ctx.businessId,
      livemode,
      method: "POST",
      path: "/v1/customers",
      status: 201,
    })
    return NextResponse.json(customer, { status: 201 })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not create customer"
    await logPlatformApi(admin, {
      businessId: auth.ctx.businessId,
      livemode,
      method: "POST",
      path: "/v1/customers",
      status: 400,
      errorCode: "create_failed",
    })
    return v1Error(400, "create_failed", message)
  }
}
