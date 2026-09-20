import { NextResponse } from "next/server"
import { getOrCreatePlatformAccount, listPlatformAccounts, publicAccount } from "@/lib/platform/ledger"
import { denyIfRestricted, logPlatformApi, requireMerchant, v1Error } from "@/lib/platform/v1"
import { createSupabaseAdmin } from "@/lib/supabase/admin"

export async function GET(request: Request) {
  const admin = createSupabaseAdmin()
  const auth = await requireMerchant(admin, request, "accounts.read")
  if (!auth.ok) return auth.response
  const livemode = auth.ctx.mode === "live"
  try {
    const accounts = await listPlatformAccounts(admin, auth.ctx.businessId, livemode)
    await logPlatformApi(admin, {
      businessId: auth.ctx.businessId,
      livemode,
      method: "GET",
      path: "/v1/accounts",
      status: 200,
    })
    return NextResponse.json({ data: accounts })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not list accounts"
    await logPlatformApi(admin, {
      businessId: auth.ctx.businessId,
      livemode,
      method: "GET",
      path: "/v1/accounts",
      status: 400,
      errorCode: "list_failed",
    })
    return v1Error(400, "list_failed", message)
  }
}

export async function POST(request: Request) {
  const admin = createSupabaseAdmin()
  const auth = await requireMerchant(admin, request, "accounts.write")
  if (!auth.ok) return auth.response
  const restricted = await denyIfRestricted(admin, auth.ctx.businessId, "deposit")
  if (restricted) return restricted
  const livemode = auth.ctx.mode === "live"
  const body = (await request.json().catch(() => null)) as { currency?: string } | null
  const currency = String(body?.currency ?? "").trim().toUpperCase()
  if (!currency || currency.length > 8) {
    return v1Error(400, "invalid_currency", "currency is required")
  }
  try {
    const account = await getOrCreatePlatformAccount(admin, {
      businessId: auth.ctx.businessId,
      livemode,
      currency,
    })
    await logPlatformApi(admin, {
      businessId: auth.ctx.businessId,
      livemode,
      method: "POST",
      path: "/v1/accounts",
      status: 201,
    })
    return NextResponse.json(publicAccount(account), { status: 201 })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not create account"
    await logPlatformApi(admin, {
      businessId: auth.ctx.businessId,
      livemode,
      method: "POST",
      path: "/v1/accounts",
      status: 400,
      errorCode: "create_failed",
    })
    return v1Error(400, "create_failed", message)
  }
}
