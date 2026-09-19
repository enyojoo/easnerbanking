import { NextResponse } from "next/server"
import { requireAuth } from "@/app/api/noah/_helpers"
import { requireAccountAllowsForUser } from "@/lib/account-restriction"
import { createSupabaseAdmin } from "@/lib/supabase/admin"
import {
  resolveGridPayInNetworks,
  resolveGridReceiveRailAvailability,
} from "@/lib/grid/receive-rails"
import { mapResidenceToLocalPayInCurrency } from "@easner/shared"

export const runtime = "nodejs"

/**
 * Supported Grid local pay-in rails for a residence corridor.
 * GET /api/grid/receive-rails?country=GH&currency=GHS
 */
export async function GET(request: Request) {
  const auth = await requireAuth(request)
  if ("error" in auth) return auth.error

  const admin = createSupabaseAdmin()
  const restricted = await requireAccountAllowsForUser(admin, auth.user.id, "deposit")
  if (restricted instanceof NextResponse) return restricted

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

  const rails = await resolveGridReceiveRailAvailability(admin, {
    countryCode: country,
    currencyCode: currency,
  })

  const anyAvailable = rails.bank_transfer.available || rails.mobile_money.available
  const momoNetworks = rails.mobile_money.available
    ? await resolveGridPayInNetworks({ country, currency })
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
