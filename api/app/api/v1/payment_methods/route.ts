import { NextResponse } from "next/server"
import { buildPlatformPaymentCatalog, PLATFORM_PAYMENT_METHODS } from "@/lib/platform/payment-methods"
import { logPlatformApi, requireMerchant } from "@/lib/platform/v1"
import { createSupabaseAdmin } from "@/lib/supabase/admin"

export async function GET(request: Request) {
  const admin = createSupabaseAdmin()
  const auth = await requireMerchant(admin, request, "accounts.read")
  if (!auth.ok) return auth.response
  const livemode = auth.ctx.mode === "live"
  await logPlatformApi(admin, {
    startedAt: auth.ctx.startedAt,
    idempotencyKey: auth.ctx.idempotencyKey,
    businessId: auth.ctx.businessId,
    livemode,
    method: "GET",
    path: "/v1/payment_methods",
    status: 200,
  })
  let catalog = null
  try {
    catalog = await buildPlatformPaymentCatalog()
  } catch (error) {
    console.warn("[v1] payment catalog:", error instanceof Error ? error.message : error)
  }
  return NextResponse.json({ data: PLATFORM_PAYMENT_METHODS, catalog })
}
