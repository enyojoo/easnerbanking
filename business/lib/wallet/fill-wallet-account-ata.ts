import type { SupabaseClient } from "@supabase/supabase-js"
import { deriveStablecoinAssociatedTokenAddress } from "@/lib/solana/ata"
import { verifyStablecoinTokenAccount } from "@/lib/solana/verify-token-account"
import { ensureWalletAccountAtaForOwner } from "@/lib/turnkey/ensure-spl-token-account"

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

/**
 * Creates canonical SPL ATAs on-chain for active Solana USDC/EURC vaults when missing.
 * Run after `fillMissingAssociatedTokenAddresses` (e.g. internal turnkey-backfill cron).
 */
export async function ensureMissingOnChainSplTokenAccounts(
  admin: SupabaseClient,
): Promise<{ attempted: number; initialized: number; failed: number }> {
  const { data: rows } = await admin
    .from("wallet_accounts")
    .select("id,address,asset,associated_token_account_address")
    .eq("chain", "solana")
    .in("asset", ["USDC", "EURC"])
    .eq("status", "active")

  let attempted = 0
  let initialized = 0
  let failed = 0

  for (const row of rows || []) {
    const vault = String(row.address || "").trim()
    const asset = String(row.asset || "").trim()
    const ata =
      String(row.associated_token_account_address || "").trim() ||
      (vault ? deriveStablecoinAssociatedTokenAddress(vault, asset) : "")
    if (!vault || !ata || (asset !== "USDC" && asset !== "EURC")) continue

    const verified = await verifyStablecoinTokenAccount(ata, vault, asset as "USDC" | "EURC")
    if (verified.ok) continue

    attempted += 1
    const res = await ensureWalletAccountAtaForOwner(admin, String(row.id))
    if (res.ok) initialized += 1
    else failed += 1
  }

  return { attempted, initialized, failed }
}
