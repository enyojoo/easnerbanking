import { NextResponse } from "next/server"
import { publicAccount, publicTransaction } from "@/lib/platform/ledger"
import { createSupabaseAdmin, getUserFromApiRequest } from "@/lib/supabase/admin"
import { requireEasnerBusinessId } from "@/lib/terminal/context"

export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await getUserFromApiRequest(request)
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const business = await requireEasnerBusinessId(user.id)
  if (!business.ok) return business.response
  const { id } = await ctx.params
  const livemode = new URL(request.url).searchParams.get("livemode") === "live"
  const admin = createSupabaseAdmin()
  const { data: account } = await admin
    .from("platform_accounts")
    .select(
      "id, currency, available_cents, pending_cents, livemode, customer_id, created_at, platform_customers(name, email, easetag, verification_status)",
    )
    .eq("id", id)
    .eq("business_id", business.businessId)
    .eq("livemode", livemode)
    .maybeSingle()
  if (!account) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const { data: transactions } = await admin
    .from("platform_transactions")
    .select(
      "id, type, amount_cents, currency, direction, status, account_id, customer_id, transfer_id, checkout_session_id, description, livemode, created_at",
    )
    .eq("business_id", business.businessId)
    .eq("livemode", livemode)
    .eq("account_id", id)
    .order("created_at", { ascending: false })
    .limit(20)

  const join = account.platform_customers
  const customer = Array.isArray(join) ? join[0] : join
  return NextResponse.json({
    account: {
      ...publicAccount(account),
      customer_name: customer?.name || customer?.email || null,
      customer_easetag: customer?.easetag ?? null,
      customer_verification: customer?.verification_status ?? null,
    },
    transactions: (transactions ?? []).map((row) => publicTransaction(row)),
  })
}
