import { NextResponse } from "next/server"
import { requireAuth } from "@/app/api/noah/_helpers"
import { createSupabaseAdmin } from "@/lib/supabase/admin"
import { resolveYcReceiveRailAvailability } from "@/lib/yellowcard/receive-rails"
import { resolveYcPayInNetworks } from "@/lib/yellowcard/pay-in-networks"
import { mapResidenceToLocalPayInCurrency } from "@easner/shared"

export const runtime = "nodejs"

/**
 * Supported YC local pay-in rails for a residence corridor.
 * GET /api/yellowcard/receive-rails?country=NG&currency=NGN
 */
export async function GET(request: Request) {
  const auth = await requireAuth(request)
  if ("error" in auth) return auth.error

  const url = new URL(request.url)
  const country = String(url.searchParams.get("country") ?? "").trim().toUpperCase()
  let currency = String(url.searchParams.get("currency") ?? "").trim().toUpperCase()
  if (!currency && country) {
    currency = mapResidenceToLocalPayInCurrency(country) ?? ""
  }
  if (!country || !currency) {
    return NextResponse.json(
      { error: "country and currency required", code: "currency_country_required" },
      { status: 400 },
    )
  }

  const admin = createSupabaseAdmin()
  const rails = await resolveYcReceiveRailAvailability(admin, {
    countryCode: country,
    currencyCode: currency,
  })

  const anyAvailable = rails.bank_transfer.available || rails.mobile_money.available
  const momoNetworks = rails.mobile_money.available
    ? await resolveYcPayInNetworks({ country, currency })
    : []

  return NextResponse.json({
    ok: true,
    country,
    currency,
    rails,
    anyAvailable,
    momoNetworks,
  })
}
