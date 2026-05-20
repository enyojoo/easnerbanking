import { NextResponse } from "next/server"
import { requireAuth, requireNoahEnv } from "../_helpers"
import { resolveNoahAccountContext } from "@/lib/noah/resolve-account-context"
import { buildNoahWalletExchangeRates, listNoahPayoutFiatCodes } from "@/lib/noah/fx-prices"

export const runtime = "nodejs"

/**
 * Noah GET /prices–backed FX rows for wallet send sources (USD, EUR) → payout fiats.
 * Used by mobile/business send preview; replaces static reference rates where Noah supports the pair.
 */
export async function GET(request: Request) {
  const mis = requireNoahEnv()
  if (mis) return mis
  const auth = await requireAuth(request)
  if ("error" in auth) return auth.error

  const acc = await resolveNoahAccountContext(request, auth.user.id)
  if (!acc.ok) return acc.response

  const url = new URL(request.url)
  const destParam = url.searchParams.get("destinations")?.trim()
  const destinations = destParam
    ? destParam
        .split(",")
        .map((c) => c.trim().toUpperCase())
        .filter((c) => /^[A-Z]{3}$/.test(c))
    : undefined

  try {
    const catalog = await listNoahPayoutFiatCodes()
    const rates = await buildNoahWalletExchangeRates({
      destinationCurrencies: destinations ?? catalog,
    })

    return NextResponse.json(
      {
        source: "noah_prices",
        catalog,
        rates,
      },
      {
        headers: {
          "Cache-Control": "private, max-age=120, stale-while-revalidate=600",
        },
      },
    )
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 400 })
  }
}
