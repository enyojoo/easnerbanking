import type { SupabaseClient } from "@supabase/supabase-js"
import { deriveStablecoinAssociatedTokenAddress } from "@/lib/solana/ata"

/**
 * Computes and persists missing `associated_token_account_address` for active Solana USDC/EURC vaults.
 */
export async function fillMissingAssociatedTokenAddresses(admin: SupabaseClient): Promise<{ updated: number }> {
  const { data: rows } = await admin
    .from("wallet_accounts")
    .select("id,address,asset,associated_token_account_address")
    .eq("chain", "solana")
    .in("asset", ["USDC", "EURC"])
    .eq("status", "active")

  let updated = 0
  const now = new Date().toISOString()
  for (const row of rows || []) {
    if (String(row.associated_token_account_address || "").trim()) continue
    const owner = String(row.address || "").trim()
    const asset = String(row.asset || "").trim()
    if (!owner || !asset) continue
    const ata = deriveStablecoinAssociatedTokenAddress(owner, asset)
    if (!ata) continue
    const { error } = await admin
      .from("wallet_accounts")
      .update({ associated_token_account_address: ata, updated_at: now })
      .eq("id", row.id)
    if (!error) updated += 1
  }
  return { updated }
}
