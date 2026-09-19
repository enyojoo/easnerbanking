import { NextResponse } from "next/server"
import { requireAuth } from "@/app/api/noah/_helpers"
import { createSupabaseAdmin } from "@/lib/supabase/admin"
import {
  getCryptoRatesRefreshTtlMs,
  listCryptoRates,
  triggerCryptoRatesBackgroundRefresh,
} from "@/lib/fx/crypto-rates"

export const runtime = "nodejs"

export async function GET(request: Request) {
  const auth = await requireAuth(request)
  if ("error" in auth) return auth.error

  const url = new URL(request.url)
  const destParam = url.searchParams.get("destinations")?.trim()
  const netParam = url.searchParams.get("networks")?.trim()
  const destinations = destParam
    ? destParam.split(",").map((c) => c.trim().toUpperCase()).filter(Boolean)
    : undefined
  const networks = netParam ? netParam.split(",").map((n) => n.trim()).filter(Boolean) : undefined

  const admin = createSupabaseAdmin()
  const rates = await listCryptoRates(admin, { destinations, networks, status: "active" })
  triggerCryptoRatesBackgroundRefresh(admin, rates, getCryptoRatesRefreshTtlMs())

  return NextResponse.json(
    {
      source: "crypto_rates",
      rates: rates.map((r) => ({
        from_currency: r.from_currency,
        to_currency: r.to_currency,
        receive_network: r.receive_network,
        rate: r.rate,
        bridge_mid: r.bridge_mid,
        as_of: r.as_of,
      })),
    },
    { headers: { "Cache-Control": "private, max-age=120, stale-while-revalidate=600" } },
  )
}
