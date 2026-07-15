import { NextResponse } from "next/server"
import { createSupabaseAdmin } from "@/lib/supabase/admin"
import { requireOfficeAdmin } from "@/lib/api/admin-auth"
import { ensureReportingFxMatrix, listReportingFxRatesAdmin } from "@/lib/admin/rates-service"

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

export async function PUT(_request: Request) {
  const auth = await requireOfficeAdmin(_request)
  if (!auth.ok) return auth.response

  return NextResponse.json(
    {
      error:
        "Reporting FX rates are read-only in Office. Use Sync rates to refresh from the pricing model.",
    },
    { status: 400 },
  )
}
