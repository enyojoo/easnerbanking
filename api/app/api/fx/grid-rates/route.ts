import { NextResponse } from "next/server"
import { requireAuth } from "@/app/api/noah/_helpers"
import { createSupabaseAdmin } from "@/lib/supabase/admin"
import {
  getGridRatesRefreshTtlMs,
  listGridRates,
  triggerGridRatesBackgroundRefresh,
} from "@/lib/fx/grid-rates"

export const runtime = "nodejs"

/** Customer-facing Grid rates from `grid_rates` (Grid mid + Easner margin). */
export async function GET(request: Request) {
  const auth = await requireAuth(request)
  if ("error" in auth) return auth.error

  const url = new URL(request.url)
  const destParam = url.searchParams.get("destinations")?.trim()
  const destinations = destParam
    ? destParam
        .split(",")
        .map((c) => c.trim().toUpperCase())
        .filter((c) => /^[A-Z]{3}$/.test(c))
    : undefined

  const admin = createSupabaseAdmin()
  const rates = await listGridRates(admin, { destinations, status: "active" }, { backgroundRefresh: false })
  triggerGridRatesBackgroundRefresh(admin, rates, getGridRatesRefreshTtlMs())

  return NextResponse.json(
    {
      source: "grid_rates",
      rates: rates.map((r) => ({
        from_currency: r.from_currency,
        to_currency: r.to_currency,
        rate: r.rate,
        grid_mid: r.grid_mid,
        margin_bps: r.margin_bps,
        as_of: r.as_of,
        country_code: r.country_code,
      })),
    },
    {
      headers: {
        "Cache-Control": "private, max-age=120, stale-while-revalidate=600",
      },
    },
  )
}
