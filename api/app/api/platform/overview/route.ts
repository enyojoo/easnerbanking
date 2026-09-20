import { NextResponse } from "next/server"
import { listPlatformAccounts, publicTransaction } from "@/lib/platform/ledger"
import { createSupabaseAdmin, getUserFromApiRequest } from "@/lib/supabase/admin"
import { requireEasnerBusinessId } from "@/lib/terminal/context"

type VolumeSide = { moneyIn: number; moneyOut: number; total: number }

function emptySide(): VolumeSide {
  return { moneyIn: 0, moneyOut: 0, total: 0 }
}

export async function GET(request: Request) {
  const user = await getUserFromApiRequest(request)
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const ctx = await requireEasnerBusinessId(user.id)
  if (!ctx.ok) return ctx.response

  const livemode = new URL(request.url).searchParams.get("livemode") === "live"
  const admin = createSupabaseAdmin()
  const [accounts, { data: lastError }, { data: recentRows }, { data: volumeRows, count }] = await Promise.all([
    listPlatformAccounts(admin, ctx.businessId, livemode),
    admin
      .from("platform_api_logs")
      .select("method, path, status, error_code, created_at")
      .eq("business_id", ctx.businessId)
      .eq("livemode", livemode)
      .gte("status", 400)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    admin
      .from("platform_transactions")
      .select(
        "id, type, amount_cents, currency, direction, status, account_id, customer_id, transfer_id, checkout_session_id, description, livemode, created_at",
      )
      .eq("business_id", ctx.businessId)
      .eq("livemode", livemode)
      .order("created_at", { ascending: false })
      .limit(6),
    admin
      .from("platform_transactions")
      .select("amount_cents, currency, direction, status", { count: "exact" })
      .eq("business_id", ctx.businessId)
      .eq("livemode", livemode)
      .eq("status", "completed"),
  ])

  const volume = { USD: emptySide(), EUR: emptySide() }
  for (const row of volumeRows ?? []) {
    const currency = String(row.currency ?? "").toUpperCase()
    if (currency !== "USD" && currency !== "EUR") continue
    const amount = Number(row.amount_cents ?? 0)
    if (row.direction === "in") volume[currency].moneyIn += amount
    if (row.direction === "out") volume[currency].moneyOut += amount
    volume[currency].total += amount
  }

  return NextResponse.json({
    accounts,
    lastError: lastError ?? null,
    recentTransactions: (recentRows ?? []).map((row) => publicTransaction(row)),
    volume,
    transactionCount: count ?? (volumeRows ?? []).length,
    moneyIn: volume.USD.moneyIn + volume.EUR.moneyIn,
    moneyOut: volume.USD.moneyOut + volume.EUR.moneyOut,
  })
}
