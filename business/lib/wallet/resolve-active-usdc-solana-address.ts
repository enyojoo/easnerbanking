import type { SupabaseClient } from "@supabase/supabase-js"
import { getWalletOwnerId } from "@/lib/wallet/resolve-wallet-owner"

export type ResolveActiveUsdcSolanaAddressInput = {
  userId: string
  businessId: string | null
}

/**
 * Active Turnkey USDC Solana vault address for ledger USD scope.
 */
export async function resolveActiveUsdcSolanaAddress(
  admin: SupabaseClient,
  input: ResolveActiveUsdcSolanaAddressInput,
): Promise<string | null> {
  const userId = String(input.userId || "").trim()
  if (!userId) return null

  const businessId = input.businessId ? String(input.businessId).trim() : null
  const walletOwnerId = await getWalletOwnerId(
    admin,
    businessId ? "business" : "individual",
    businessId ?? userId,
  )
  if (!walletOwnerId) return null

  const { data: walletRow } = await admin
    .from("wallet_accounts")
    .select("address")
    .eq("wallet_owner_id", walletOwnerId)
    .eq("ledger_currency", "USD")
    .eq("asset", "USDC")
    .eq("status", "active")
    .maybeSingle()

  const address = String(walletRow?.address ?? "").trim()
  return address || null
}
