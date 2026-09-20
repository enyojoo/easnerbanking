import { NextResponse } from "next/server"
import { isMerchantSecretKey, isTransferAuthorizeSecret } from "@/lib/checkout/secrets"
import { publicTransfer, type PlatformTransferRow } from "@/lib/platform/objects"
import { platformTransferHttpError, reviewPlatformTransfer } from "@/lib/platform/transfer-authorize"
import { readBearerToken, requireMerchant, v1Error } from "@/lib/platform/v1"
import { createSupabaseAdmin } from "@/lib/supabase/admin"

const GET_SELECT =
  "id, quote_id, source_account_id, destination_id, amount_cents, currency, status, livemode, created_at, expires_at"

export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const admin = createSupabaseAdmin()
  const { id } = await ctx.params
  const token = readBearerToken(request.headers.get("authorization"))
  if (isTransferAuthorizeSecret(token) && !isMerchantSecretKey(token)) {
    try {
      const review = await reviewPlatformTransfer(admin, { transferId: id, clientSecret: token })
      return NextResponse.json(review)
    } catch (error) {
      const mapped = platformTransferHttpError(error)
      return v1Error(mapped.status, mapped.code, mapped.message)
    }
  }
  const auth = await requireMerchant(admin, request, "accounts.read")
  if (!auth.ok) return auth.response
  const { data } = await admin
    .from("platform_transfers")
    .select(GET_SELECT)
    .eq("id", id)
    .eq("business_id", auth.ctx.businessId)
    .maybeSingle()
  if (!data) return v1Error(404, "not_found", "Not found")
  return NextResponse.json(publicTransfer(data as PlatformTransferRow))
}
