import { NextResponse } from "next/server"
import { publicTransaction } from "@/lib/platform/ledger"
import { logPlatformApi, requireMerchant } from "@/lib/platform/v1"
import { createSupabaseAdmin } from "@/lib/supabase/admin"

export async function GET(request: Request) {
  const admin = createSupabaseAdmin()
  const auth = await requireMerchant(admin, request, "accounts.read")
  if (!auth.ok) return auth.response
  const livemode = auth.ctx.mode === "live"
  const { data } = await admin
    .from("platform_transactions")
    .select(
      "id, type, amount_cents, currency, direction, status, account_id, customer_id, transfer_id, checkout_session_id, description, livemode, created_at",
    )
    .eq("business_id", auth.ctx.businessId)
    .eq("livemode", livemode)
    .order("created_at", { ascending: false })
    .limit(100)
  await logPlatformApi(admin, {
    businessId: auth.ctx.businessId,
    livemode,
    method: "GET",
    path: "/v1/transactions",
    status: 200,
  })
  return NextResponse.json({ data: (data ?? []).map((row) => publicTransaction(row)) })
}
