import { NextResponse } from "next/server"
import { createPlatformDestination, publicDestination } from "@/lib/platform/objects"
import { logPlatformApi, requireMerchant, v1Error } from "@/lib/platform/v1"
import { createSupabaseAdmin } from "@/lib/supabase/admin"

const DESTINATION_TYPES = new Set(["bank", "mobile_money", "wallet", "easetag"])

export async function GET(request: Request) {
  const admin = createSupabaseAdmin()
  const auth = await requireMerchant(admin, request, "accounts.read")
  if (!auth.ok) return auth.response
  const livemode = auth.ctx.mode === "live"
  const { data } = await admin
    .from("platform_destinations")
    .select("id, type, customer_id, details, livemode, created_at")
    .eq("business_id", auth.ctx.businessId)
    .eq("livemode", livemode)
    .order("created_at", { ascending: false })
    .limit(100)
  await logPlatformApi(admin, {
    startedAt: auth.ctx.startedAt,
    businessId: auth.ctx.businessId,
    livemode,
    method: "GET",
    path: "/v1/destinations",
    status: 200,
  })
  return NextResponse.json({ data: (data ?? []).map((row) => publicDestination(row)) })
}

export async function POST(request: Request) {
  const admin = createSupabaseAdmin()
  const auth = await requireMerchant(admin, request, "transfers.write")
  if (!auth.ok) return auth.response
  const livemode = auth.ctx.mode === "live"
  const body = (await request.json().catch(() => null)) as {
    type?: string
    customer?: string
    details?: Record<string, unknown>
  } | null
  const type = String(body?.type ?? "")
  if (!DESTINATION_TYPES.has(type)) {
    return v1Error(400, "invalid_type", "type must be bank, mobile_money, wallet, or easetag")
  }
  try {
    const destination = await createPlatformDestination(admin, {
      businessId: auth.ctx.businessId,
      livemode,
      type: type as "bank" | "mobile_money" | "wallet" | "easetag",
      customerId: body?.customer ?? null,
      details: body?.details && typeof body.details === "object" ? body.details : {},
    })
    await logPlatformApi(admin, {
      startedAt: auth.ctx.startedAt,
      businessId: auth.ctx.businessId,
      livemode,
      method: "POST",
      path: "/v1/destinations",
      status: 201,
    })
    return NextResponse.json(destination, { status: 201 })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not create destination"
    return v1Error(400, "create_failed", message)
  }
}
