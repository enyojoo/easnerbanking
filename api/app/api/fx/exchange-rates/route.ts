import { NextResponse } from "next/server"
import { createSupabaseAdmin, getUserFromApiRequest } from "@/lib/supabase/admin"
import {
  listReportingFxRates,
  triggerExchangeRatesBackgroundRefresh,
} from "@/lib/fx/exchange-rates"
import { ensureReportingFxMatrix } from "@/lib/admin/rates-service"

export async function GET(request: Request) {
  const user = await getUserFromApiRequest(request)
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const admin = createSupabaseAdmin()
  try {
    await ensureReportingFxMatrix(admin)
  } catch (e) {
    console.warn("[fx/exchange-rates] bootstrap:", e)
  }

  const normalized = await listReportingFxRates(admin)

  // Return DB rows immediately; refresh stale rates asynchronously.
  triggerExchangeRatesBackgroundRefresh(admin, normalized)

  return NextResponse.json(
    {
      rates: normalized,
    },
    {
      headers: {
        "Cache-Control": "private, max-age=30, stale-while-revalidate=300",
      },
    },
  )
}
