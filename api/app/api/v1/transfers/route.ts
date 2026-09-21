import { NextResponse } from "next/server"
import { createPlatformTransfer, publicTransfer, type PlatformTransferRow } from "@/lib/platform/objects"
import { platformTransferHttpError } from "@/lib/platform/transfer-authorize"
import {
  denyIfRestricted,
  logPlatformApi,
  parseMinorAmount,
  readIdempotencyKey,
  requireMerchant,
  v1Error,
} from "@/lib/platform/v1"
import { createSupabaseAdmin } from "@/lib/supabase/admin"

const LIST_SELECT =
  "id, quote_id, source_account_id, destination_id, amount_cents, currency, status, livemode, created_at, expires_at"

export async function GET(request: Request) {
  const admin = createSupabaseAdmin()
  const auth = await requireMerchant(admin, request, "accounts.read")
  if (!auth.ok) return auth.response
  const livemode = auth.ctx.mode === "live"
  const { data } = await admin
    .from("platform_transfers")
    .select(LIST_SELECT)
    .eq("business_id", auth.ctx.businessId)
    .eq("livemode", livemode)
    .order("created_at", { ascending: false })
    .limit(100)
  return NextResponse.json({ data: (data ?? []).map((row) => publicTransfer(row as PlatformTransferRow)) })
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
    const transfer = await createPlatformTransfer(admin, {
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
      startedAt: auth.ctx.startedAt,
      idempotencyKey: auth.ctx.idempotencyKey,
      businessId: auth.ctx.businessId,
      livemode,
      method: "POST",
      path: "/v1/transfers",
      status: 201,
    })
    return NextResponse.json(transfer, { status: 201 })
  } catch (error) {
    const mapped = platformTransferHttpError(error)
    await logPlatformApi(admin, {
      startedAt: auth.ctx.startedAt,
      idempotencyKey: auth.ctx.idempotencyKey,
      businessId: auth.ctx.businessId,
      livemode,
      method: "POST",
      path: "/v1/transfers",
      status: mapped.status,
      errorCode: mapped.code,
    })
    return v1Error(mapped.status, mapped.code, mapped.message)
  }
}
