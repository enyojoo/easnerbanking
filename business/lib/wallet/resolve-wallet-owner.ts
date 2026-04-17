import type { SupabaseClient } from "@supabase/supabase-js"
import type { NoahAccountContext } from "@/lib/noah/resolve-account-context"
import { getActiveWalletAddress } from "@/lib/wallet/turnkey-wallet-db"
import { vaultSpecForNoahAssetNetwork } from "@/lib/wallet/noah-pair-to-vault"

export async function getWalletOwnerId(
  admin: SupabaseClient,
  ownerType: "individual" | "business",
  ownerRef: string,
): Promise<string | null> {
  const { data } = await admin
    .from("wallet_owners")
    .select("id")
    .eq("owner_type", ownerType)
    .eq("owner_ref", ownerRef)
    .maybeSingle()
  return data?.id ? String(data.id) : null
}

/** Active Turnkey receive address for Noah workflows when asset/network match a provisioned vault. */
export async function resolveTurnkeyAddressForNoahPair(
  admin: SupabaseClient,
  ctx: NoahAccountContext,
  cryptoCurrency: string,
  network: string,
): Promise<string | null> {
  const spec = vaultSpecForNoahAssetNetwork(cryptoCurrency, network)
  if (!spec) return null
  const ownerType: "individual" | "business" = ctx.scope === "business" ? "business" : "individual"
  const ownerRef =
    ctx.scope === "business" && ctx.subjectBusinessId ? ctx.subjectBusinessId : ctx.subjectUserId
  const ownerId = await getWalletOwnerId(admin, ownerType, ownerRef)
  if (!ownerId) return null
  return getActiveWalletAddress(admin, ownerId, spec.chain, spec.asset, spec.ledgerCurrency)
}
