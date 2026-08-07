import { NextResponse } from "next/server"
import { createSupabaseAdmin } from "@/lib/supabase/admin"
import { requireOfficeAdmin } from "@/lib/api/admin-auth"
import { listCryptoRatesAdmin, upsertCryptoRatesAdmin } from "@/lib/admin/crypto-rates-service"

export const runtime = "nodejs"

export async function GET(request: Request) {
  const auth = await requireOfficeAdmin(request)
  if (!auth.ok) return auth.response

  try {
    const admin = createSupabaseAdmin()
    const rates = await listCryptoRatesAdmin(admin)
    return NextResponse.json({ rates })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to load crypto rates" },
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
    await upsertCryptoRatesAdmin(
      admin,
      rows.map((row) => {
        const r = row as Record<string, unknown>
        return {
          from_currency: String(r.from_currency ?? ""),
          to_currency: String(r.to_currency ?? ""),
          receive_network: String(r.receive_network ?? ""),
          rate: Number(r.rate) || 0,
          bridge_mid: r.bridge_mid == null ? undefined : Number(r.bridge_mid),
          margin_bps: r.margin_bps == null ? undefined : Number(r.margin_bps),
          status: String(r.status ?? "active"),
        }
      }),
    )
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Invalid crypto rates payload" },
      { status: 400 },
    )
  }
}
