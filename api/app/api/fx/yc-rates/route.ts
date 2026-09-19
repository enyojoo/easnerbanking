import { NextResponse } from "next/server"
import { requireAuth } from "@/app/api/noah/_helpers"
import { createSupabaseAdmin } from "@/lib/supabase/admin"
import {
  getYcRatesRefreshTtlMs,
  listYcRates,
  triggerYcRatesBackgroundRefresh,
} from "@/lib/fx/yc-rates"

export const runtime = "nodejs"

/**
 * Customer-facing YC rates from `yellowcard_rates` (provider buy/sell + Easner margin).
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
  const rates = await listYcRates(admin, { destinations, status: "active" })
  triggerYcRatesBackgroundRefresh(admin, rates, getYcRatesRefreshTtlMs())

  return NextResponse.json(
    {
      source: "yellowcard_rates",
      rates: rates.map((r) => ({
        from_currency: r.from_currency,
        to_currency: r.to_currency,
        rate: r.rate,
        yc_buy: r.yc_buy,
        yc_sell: r.yc_sell,
        easner_buy: r.easner_buy,
        easner_sell: r.easner_sell,
        yc_cross_mid: r.yc_cross_mid,
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
