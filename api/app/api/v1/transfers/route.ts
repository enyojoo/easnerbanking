import { NextResponse } from "next/server"
import { executePlatformTransfer, publicTransfer } from "@/lib/platform/objects"
import {
  denyIfRestricted,
  logPlatformApi,
  parseMinorAmount,
  readIdempotencyKey,
  requireMerchant,
  v1Error,
} from "@/lib/platform/v1"
import { createSupabaseAdmin } from "@/lib/supabase/admin"

export async function GET(request: Request) {
  const admin = createSupabaseAdmin()
  const auth = await requireMerchant(admin, request, "accounts.read")
  if (!auth.ok) return auth.response
  const livemode = auth.ctx.mode === "live"
  const { data } = await admin
    .from("platform_transfers")
    .select("id, quote_id, source_account_id, destination_id, amount_cents, currency, status, livemode, created_at")
    .eq("business_id", auth.ctx.businessId)
    .eq("livemode", livemode)
    .order("created_at", { ascending: false })
    .limit(100)
  return NextResponse.json({ data: (data ?? []).map((row) => publicTransfer(row)) })
}

export async function POST(request: Request) {
  const admin = createSupabaseAdmin()
  const auth = await requireMerchant(admin, request, "transfers.write")
  if (!auth.ok) return auth.response
  const restricted = await denyIfRestricted(admin, auth.ctx.businessId, "send")
  if (restricted) return restricted
  const livemode = auth.ctx.mode === "live"
  const body = (await request.json().catch(() => null)) as {
    quote?: string
    source?: string
    destination?: string
    amount?: number
    currency?: string
  } | null
  try {
    const transfer = await executePlatformTransfer(admin, {
      businessId: auth.ctx.businessId,
      livemode,
      quoteId: body?.quote ?? null,
      sourceAccountId: body?.source ?? null,
      destinationId: body?.destination ?? null,
      amountCents: body?.amount != null ? parseMinorAmount(body.amount) : null,
      currency: body?.currency,
      idempotencyKey: readIdempotencyKey(request),
    })
    await logPlatformApi(admin, {
      businessId: auth.ctx.businessId,
      livemode,
      method: "POST",
      path: "/v1/transfers",
      status: 201,
    })
    return NextResponse.json(transfer, { status: 201 })
  } catch (error) {
    const code =
      error && typeof error === "object" && "code" in error
        ? String((error as { code?: string }).code)
        : "transfer_failed"
    const status =
      code === "not_available" ? 409 : code === "not_found" ? 404 : code === "verification_required" ? 403 : 400
    const message = error instanceof Error ? error.message : "Could not create transfer"
    const errorCode =
      code === "not_available" || code === "not_found" || code === "verification_required" ? code : "transfer_failed"
    await logPlatformApi(admin, {
      businessId: auth.ctx.businessId,
      livemode,
      method: "POST",
      path: "/v1/transfers",
      status,
      errorCode,
    })
    return v1Error(status, errorCode, message)
  }
}
