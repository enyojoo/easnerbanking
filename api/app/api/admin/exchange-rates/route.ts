import { NextResponse } from "next/server"
import { createSupabaseAdmin } from "@/lib/supabase/admin"
import { requireOfficeAdmin } from "@/lib/api/admin-auth"
import {
  ensureReportingFxMatrix,
  listReportingFxRatesAdmin,
  upsertExchangeRatesAdmin,
} from "@/lib/admin/rates-service"

export async function GET(request: Request) {
  const auth = await requireOfficeAdmin(request)
  if (!auth.ok) return auth.response

  try {
    const admin = createSupabaseAdmin()
    await ensureReportingFxMatrix(admin)
    const rates = await listReportingFxRatesAdmin(admin)
    return NextResponse.json({ rates })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to load reporting FX rates" },
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
          fee_type: "free" as const,
          fee_amount: 0,
          status: String(r.status ?? "active"),
        }
      }),
    )
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Invalid reporting FX payload" },
      { status: 400 },
    )
  }
}
