import { NextResponse } from "next/server"
import { createSupabaseAdmin } from "@/lib/supabase/admin"
import { requireOfficeAdmin } from "@/lib/api/admin-auth"
import { listExchangeRatesAdmin, upsertExchangeRatesAdmin } from "@/lib/admin/rates-service"

export async function GET(request: Request) {
  const auth = await requireOfficeAdmin(request)
  if (!auth.ok) return auth.response

  try {
    const admin = createSupabaseAdmin()
    const rates = await listExchangeRatesAdmin(admin)
    return NextResponse.json({ rates })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to load rates" },
      { status: 500 },
    )
  }
}

export async function PUT(request: Request) {
  const auth = await requireOfficeAdmin(request)
  if (!auth.ok) return auth.response

  const body = (await request.json().catch(() => null)) as { rates?: unknown } | null
  const rows = Array.isArray(body?.rates) ? body.rates : null
  if (!rows?.length) return NextResponse.json({ error: "rates array required" }, { status: 400 })

  try {
    const admin = createSupabaseAdmin()
    await upsertExchangeRatesAdmin(
      admin,
      rows.map((row) => {
        const r = row as Record<string, unknown>
        return {
          from_currency: String(r.from_currency ?? ""),
          to_currency: String(r.to_currency ?? ""),
          rate: Number(r.rate) || 0,
          fee_type: String(r.fee_type ?? "free") as "free" | "fixed" | "percentage",
          fee_amount: Number(r.fee_amount) || 0,
          min_amount: r.min_amount == null ? null : Number(r.min_amount),
          max_amount: r.max_amount == null ? null : Number(r.max_amount),
          status: String(r.status ?? "active"),
        }
      }),
    )
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Invalid rates payload" },
      { status: 400 },
    )
  }
}
