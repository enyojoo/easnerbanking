import type { SupabaseClient } from "@supabase/supabase-js"
import type { NoahAccountContext } from "@/lib/noah/resolve-account-context"
import { resolveTurnkeyAddressForNoahPair } from "@/lib/wallet/resolve-wallet-owner"
import {
  isDepositOmnibusCustomerAllowed,
  isDepositOmnibusEnabled,
  resolveDepositOmnibusAddressForLedgerCurrency,
} from "@/lib/deposit-omnibus/config"

function ledgerCurrencyFromCrypto(cryptoCurrency: string): "USD" | "EUR" {
  const c = String(cryptoCurrency || "").toUpperCase()
  return c.includes("EURC") ? "EUR" : "USD"
}

/**
 * VA on-ramp DestinationAddress: user Turnkey (default) or deposit omnibus when flagged.
 */
export async function resolveBankOnrampDestinationAddress(
  admin: SupabaseClient,
  ctx: NoahAccountContext,
  cryptoCurrency: string,
  network: string,
): Promise<string | null> {
  const useOmnibus =
    isDepositOmnibusEnabled() && isDepositOmnibusCustomerAllowed(ctx.noahCustomerId)

  if (useOmnibus) {
    const lc = ledgerCurrencyFromCrypto(cryptoCurrency)
    const omnibus = resolveDepositOmnibusAddressForLedgerCurrency(lc)
    if (omnibus) return omnibus
    console.warn("[resolveBankOnrampDestinationAddress] omnibus enabled but address missing", {
      ledgerCurrency: lc,
      noahCustomerId: ctx.noahCustomerId,
    })
  }

  return resolveTurnkeyAddressForNoahPair(admin, ctx, cryptoCurrency, network)
}
