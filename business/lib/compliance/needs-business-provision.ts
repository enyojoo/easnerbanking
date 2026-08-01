import type { SupabaseClient } from "@supabase/supabase-js"
import { getWalletOwnerId } from "@/lib/wallet/resolve-wallet-owner"

/**
 * True when KYB is approved but Turnkey deposit vaults are not ready yet.
 * Fiat bank VAs are geo-eligible and optional — Turnkey USDC is the primary receive rail.
 */
export async function needsBusinessProvisionAfterApproval(
  admin: SupabaseClient,
  input: { businessId: string; userId: string },
): Promise<boolean> {
  void input.userId
  const ownerId = await getWalletOwnerId(admin, "business", input.businessId)
  if (!ownerId) return true

  const { data: accounts } = await admin
    .from("wallet_accounts")
    .select("id,address,associated_token_account_address")
    .eq("wallet_owner_id", ownerId)
    .eq("status", "active")
    .limit(4)

  return !(accounts ?? []).some(
    (row) =>
      String(row.address ?? "").trim() ||
      String(row.associated_token_account_address ?? "").trim(),
  )
}
