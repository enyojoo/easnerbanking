import { NextResponse } from "next/server"
import { createSupabaseAdmin, getUserFromApiRequest } from "@/lib/supabase/admin"

export async function GET(request: Request) {
  const user = await getUserFromApiRequest(request)
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const admin = createSupabaseAdmin()
  const { data, error } = await admin
    .from("exchange_rates")
    .select("from_currency,to_currency,rate,as_of")
    .eq("status", "active")
    .in("from_currency", ["USD", "EUR"])
    .in("to_currency", ["USD", "EUR"])

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  return NextResponse.json({
    rates: (data ?? []).map((row) => ({
      from_currency: String(row.from_currency ?? "").toUpperCase(),
      to_currency: String(row.to_currency ?? "").toUpperCase(),
      rate: Number(row.rate ?? 0),
      as_of: String(row.as_of ?? new Date().toISOString()),
    })),
  })
}
