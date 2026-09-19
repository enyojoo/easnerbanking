import { NextResponse } from "next/server"
import { createSupabaseAdmin } from "@/lib/supabase/admin"
import { requireOfficeAdmin } from "@/lib/api/admin-auth"
import { listYcRatesAdmin, upsertYcRatesAdmin } from "@/lib/admin/yc-rates-service"

export const runtime = "nodejs"

export async function GET(request: Request) {
  const auth = await requireOfficeAdmin(request)
  if (!auth.ok) return auth.response

  try {
    const admin = createSupabaseAdmin()
    const rates = await listYcRatesAdmin(admin)
    return NextResponse.json({ rates })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to load Yellowcard rates" },
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
    await upsertYcRatesAdmin(
      admin,
      rows.map((row) => {
        const r = row as Record<string, unknown>
        return {
          from_currency: String(r.from_currency ?? ""),
          to_currency: String(r.to_currency ?? ""),
          rate: Number(r.rate) || 0,
          yc_buy: r.yc_buy == null ? null : Number(r.yc_buy),
          yc_sell: r.yc_sell == null ? null : Number(r.yc_sell),
          margin_bps: r.margin_bps == null ? undefined : Number(r.margin_bps),
          status: String(r.status ?? "active"),
        }
      }),
    )
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Invalid Yellowcard rates payload" },
      { status: 400 },
    )
  }
}
