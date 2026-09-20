import { NextResponse } from "next/server"
import { publicAccount } from "@/lib/platform/ledger"
import { createSupabaseAdmin, getUserFromApiRequest } from "@/lib/supabase/admin"
import { requireEasnerBusinessId } from "@/lib/terminal/context"

export async function GET(request: Request) {
  const user = await getUserFromApiRequest(request)
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const ctx = await requireEasnerBusinessId(user.id)
  if (!ctx.ok) return ctx.response
  const livemode = new URL(request.url).searchParams.get("livemode") === "live"
  const admin = createSupabaseAdmin()
  const { data, error } = await admin
    .from("platform_accounts")
    .select(
      "id, currency, available_cents, pending_cents, livemode, customer_id, created_at, platform_customers(name, email)",
    )
    .eq("business_id", ctx.businessId)
    .eq("livemode", livemode)
    .not("customer_id", "is", null)
    .order("created_at", { ascending: false })
    .limit(100)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({
    accounts: (data ?? []).map((row) => {
      const join = row.platform_customers
      const customer = Array.isArray(join) ? join[0] : join
      return {
        ...publicAccount(row),
        customer_name: customer?.name || customer?.email || null,
      }
    }),
  })
}
