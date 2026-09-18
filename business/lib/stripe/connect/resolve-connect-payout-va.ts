import type { SupabaseClient } from "@supabase/supabase-js"
import { resolveBusinessOrgOwnerUserId } from "@/lib/business/org-owner"
import { resolveVirtualAccountPreferProvider } from "@/lib/bridge/va-prefer-provider"
import { getVirtualAccountDisplayFromDb } from "@/lib/noah/virtual-accounts-db"
import type { VirtualAccountDisplay } from "@/lib/noah/payment-method-map"
import type { StripeSettlementRail } from "../types"

export type ConnectPayoutVaProvider = "grid" | "bridge"

export type ConnectPayoutVa = {
  va: VirtualAccountDisplay
  provider: ConnectPayoutVaProvider
  rail: Exclude<StripeSettlementRail, "turnkey_stablecoin">
}

function fiatCurrency(currency?: string): "usd" | "eur" | "gbp" {
  const c = String(currency || "USD").trim().toUpperCase()
  if (c === "EUR") return "eur"
  if (c === "GBP") return "gbp"
  return "usd"
}

function railForProvider(provider: ConnectPayoutVaProvider): ConnectPayoutVa["rail"] {
  return provider === "bridge" ? "bridge_va" : "grid_va"
}

/**
 * Office pay-in overlay (Grid vs Bridge) decides which business VA Stripe pays out to.
 */
export async function resolveConnectPayoutVa(
  admin: SupabaseClient,
  input: { businessId: string; currency?: string },
): Promise<ConnectPayoutVa | null> {
  const currency = fiatCurrency(input.currency)
  const ownerId = await resolveBusinessOrgOwnerUserId(admin, input.businessId).catch(() => null)
  const prefer =
    ownerId
      ? await resolveVirtualAccountPreferProvider(admin, {
          userId: ownerId,
          businessId: input.businessId,
          currency,
        })
      : undefined
  const provider: ConnectPayoutVaProvider = prefer === "bridge" ? "bridge" : "grid"

  const va = await getVirtualAccountDisplayFromDb(admin, {
    currency,
    businessId: input.businessId,
    userId: ownerId ?? undefined,
    provider,
  })
  if (!va?.hasAccount) return null

  const fromRow = String(va.provider ?? "").trim().toLowerCase()
  const resolved: ConnectPayoutVaProvider = fromRow === "bridge" ? "bridge" : "grid"
  return { va, provider: resolved, rail: railForProvider(resolved) }
}
