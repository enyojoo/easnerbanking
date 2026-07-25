import { NextResponse } from "next/server"
import type { SupabaseClient } from "@supabase/supabase-js"
import { resolveRecipientPayoutRail } from "@easner/shared"
import { resolveRecipientPayoutCountry } from "@/lib/terminal/recipient-payout-country"
import {
  NoProviderForCorridorError,
  selectProviderForCorridor,
} from "@/lib/payout-providers"

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
   * When true, require a live executable provider for this corridor (Noah sell,
   * Grid discovery, or YC send channel — whichever Office routes first).
   * Use for quote/send only — not recipient save.
   */
  requireExecutableProviderChannel?: boolean
  /** @deprecated Use requireExecutableProviderChannel */
  requireExecutableNoahChannel?: boolean
}

/** Default true in production unless REQUIRE_EXECUTABLE_PROVIDER_CHANNEL=false. */
export function requireExecutableProviderChannel(): boolean {
  const v = process.env.REQUIRE_EXECUTABLE_PROVIDER_CHANNEL?.trim().toLowerCase()
  if (v === "false" || v === "0") return false
  if (v === "true" || v === "1") return true
  return process.env.NODE_ENV === "production"
}

function shouldRequireExecutableProvider(options?: PayoutCorridorGateOptions): boolean {
  if (options?.requireExecutableProviderChannel === true) return true
  if (options?.requireExecutableProviderChannel === false) return false
  if (options?.requireExecutableNoahChannel === true) return true
  if (options?.requireExecutableNoahChannel === false) return false
  return requireExecutableProviderChannel()
}

/**
 * Returns an error response if the row maps to a disabled or mismatched payout corridor,
 * or when quote/send requires a provider that cannot execute on this corridor.
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
  const currency = String(row.currency || "").trim().toUpperCase()

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
  if (String(data.currency_code).toUpperCase() !== currency) {
    return NextResponse.json(
      { error: "Country and currency do not match an active payout corridor." },
      { status: 400 },
    )
  }

  if (shouldRequireExecutableProvider(options)) {
    try {
      await selectProviderForCorridor(admin, {
        countryCode: cc,
        currencyCode: currency,
        rail,
        mobileProvider: row.mobile_provider,
        bankName: row.bank_name,
      })
    } catch (e) {
      if (e instanceof NoProviderForCorridorError) {
        return NextResponse.json(
          {
            error:
              "Payouts to this country and currency are not available on configured providers yet. Choose another recipient or try again later.",
            code: "PAYOUT_PROVIDER_UNAVAILABLE",
          },
          { status: 400 },
        )
      }
      throw e
    }
  }

  return null
}
