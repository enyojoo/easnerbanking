import { NextResponse } from "next/server"
import { requireAuth } from "@/app/api/noah/_helpers"
import { createSupabaseAdmin } from "@/lib/supabase/admin"
import {
  getNoahRatesRefreshTtlMs,
  listNoahRates,
  triggerNoahRatesBackgroundRefresh,
} from "@/lib/fx/noah-rates"

export const runtime = "nodejs"

/**
 * Customer-facing global payout rates from `noah_rates` (Noah mid + Easner margin).
 * Used by business/mobile send preview — not live Noah /prices on every screen load.
 */
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
  const rates = await listNoahRates(admin, { destinations, status: "active" })
  triggerNoahRatesBackgroundRefresh(admin, rates, getNoahRatesRefreshTtlMs())

  return NextResponse.json(
    {
      source: "noah_rates",
      rates: rates.map((r) => ({
        from_currency: r.from_currency,
        to_currency: r.to_currency,
        rate: r.rate,
        noah_mid: r.noah_mid,
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
