import { NextResponse } from "next/server"
import { listPlatformAccounts, publicTransaction } from "@/lib/platform/ledger"
import { publicCustomer, publicDestination } from "@/lib/platform/objects"
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
  const { data: customer } = await admin
    .from("platform_customers")
    .select("id, email, name, external_id, easetag, status, verification_status, livemode, created_at")
    .eq("id", id)
    .eq("business_id", business.businessId)
    .eq("livemode", livemode)
    .maybeSingle()
  if (!customer) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const [accounts, destinations, transactions] = await Promise.all([
    listPlatformAccounts(admin, business.businessId, livemode, { customerId: id }),
    admin
      .from("platform_destinations")
      .select("id, type, customer_id, details, livemode, created_at")
      .eq("business_id", business.businessId)
      .eq("livemode", livemode)
      .eq("customer_id", id)
      .order("created_at", { ascending: false })
      .limit(50),
    admin
      .from("platform_transactions")
      .select(
        "id, type, amount_cents, currency, direction, status, account_id, customer_id, transfer_id, checkout_session_id, description, livemode, created_at",
      )
      .eq("business_id", business.businessId)
      .eq("livemode", livemode)
      .eq("customer_id", id)
      .order("created_at", { ascending: false })
      .limit(20),
  ])

  return NextResponse.json({
    customer: publicCustomer(customer),
    accounts,
    destinations: (destinations.data ?? []).map((row) =>
      publicDestination(row as Parameters<typeof publicDestination>[0]),
    ),
    transactions: (transactions.data ?? []).map((row) => publicTransaction(row)),
  })
}
