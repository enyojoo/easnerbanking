import { NextResponse } from "next/server"
import type { SupabaseClient } from "@supabase/supabase-js"
import { resolveRecipientPayoutRail } from "@easner/shared"
import { resolveRecipientPayoutCountry } from "@/lib/terminal/recipient-payout-country"
import { hasNoahSellChannelForRail } from "@/lib/noah/channel-availability"
type RecipientLike = {
  country_code?: string | null
  currency: string
  mobile_provider?: string | null
  wallet_network?: string | null
  bank_name?: string | null
}

function isWalletRow(row: RecipientLike): boolean {
  return Boolean(row.wallet_network) && !isEasenetRow(row)
}

function isEasenetRow(row: RecipientLike): boolean {
  const b = String(row.bank_name || "")
  const low = b.toLowerCase()
  return low.includes("easenet") || low.includes("easetag")
}

function isMobileRow(row: RecipientLike): boolean {
  return (
    resolveRecipientPayoutRail({
      bank_name: row.bank_name,
      mobile_provider: row.mobile_provider,
    }) === "mobile_money"
  )
}

export type PayoutCorridorGateOptions = {
  /**
   * When true, also require Noah GET /channels/sell (executable payout).
   * Use for quote/send only — not recipient save. Noah may list a country on
   * /channels/sell/countries and quote /prices without sell channels yet (e.g. NGN).
   */
  requireExecutableNoahChannel?: boolean
}

/** Default true in production unless REQUIRE_EXECUTABLE_PROVIDER_CHANNEL=false. */
export function requireExecutableProviderChannel(): boolean {
  const v = process.env.REQUIRE_EXECUTABLE_PROVIDER_CHANNEL?.trim().toLowerCase()
  if (v === "false" || v === "0") return false
  if (v === "true" || v === "1") return true
  return process.env.NODE_ENV === "production"
}

/**
 * Returns an error response if the row maps to a disabled or mismatched payout corridor.
 * No-op when row is wallet/easenet or country is missing.
 */
export async function payoutCorridorGate(
  admin: SupabaseClient,
  row: RecipientLike,
  options?: PayoutCorridorGateOptions,
): Promise<NextResponse | null> {
  if (isWalletRow(row) || isEasenetRow(row)) return null

  const cc = resolveRecipientPayoutCountry({
    country_code: row.country_code,
    currency: row.currency,
  })
  if (!cc) return null

  const rail = isMobileRow(row) ? "mobile_money" : "bank_transfer"
  const { data, error } = await admin
    .from("payout_corridors")
    .select("enabled,currency_code")
    .eq("rail", rail)
    .eq("country_code", cc)
    .maybeSingle()

  if (error) return null
  if (!data) return null

  if (!data.enabled) {
    return NextResponse.json(
      { error: "This payout corridor is temporarily unavailable. Choose another country or try again later." },
      { status: 400 },
    )
  }
  if (String(data.currency_code).toUpperCase() !== String(row.currency || "").toUpperCase()) {
    return NextResponse.json(
      { error: "Country and currency do not match an active payout corridor." },
      { status: 400 },
    )
  }

  if (options?.requireExecutableNoahChannel) {
    const sellOk = await hasNoahSellChannelForRail({
      country: cc,
      fiatCurrency: String(row.currency || "").toUpperCase(),
      rail,
    })
    if (!sellOk) {
      return NextResponse.json(
        {
          error:
            "Payouts to this country and currency are not available on your Noah program yet. You can save this recipient, but sending is not supported until Noah enables sell channels for this corridor.",
          code: "NOAH_SELL_CHANNEL_UNAVAILABLE",
        },
        { status: 400 },
      )
    }
  }

  return null
}
