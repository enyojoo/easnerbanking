import type { SupabaseClient } from "@supabase/supabase-js"
import { deriveStablecoinAssociatedTokenAddress } from "@/lib/solana/ata"
import { ensureStablecoinTokenAccountOnChain } from "@/lib/turnkey/ensure-spl-token-account"

/**
 * Ensure the canonical SPL ATA exists on-chain before passing the vault to Relay.
 * Without this, bridges may treat the ATA pubkey as owner and strand funds in a nested ATA.
 */
export async function ensureWalletAccountSplAta(
  admin: SupabaseClient,
  input: { walletOwnerId: string; vaultAddress: string; asset: "USDC" | "EURC" },
): Promise<{ ata: string }> {
  const walletOwnerId = String(input.walletOwnerId || "").trim()
  const vaultAddress = String(input.vaultAddress || "").trim()
  if (!walletOwnerId || !vaultAddress) throw new Error("wallet_account_ata_invalid_input")

  const derivedAta = deriveStablecoinAssociatedTokenAddress(vaultAddress, input.asset)
  if (!derivedAta) throw new Error("ata_derivation_failed")

  const { data: wallet } = await admin
    .from("wallet_accounts")
    .select("id, associated_token_account_address, turnkey_sub_organization_id")
    .eq("wallet_owner_id", walletOwnerId)
    .eq("address", vaultAddress)
    .eq("asset", input.asset)
    .eq("chain", "solana")
    .eq("status", "active")
    .maybeSingle()

  if (!wallet?.id) throw new Error("wallet_account_not_found")

  const subOrgId = String(wallet.turnkey_sub_organization_id ?? "").trim()
  if (!subOrgId) throw new Error("wallet_sub_org_missing")

  const ensured = await ensureStablecoinTokenAccountOnChain({
    subOrgId,
    vaultAddress,
    asset: input.asset,
    expectedAta: wallet.associated_token_account_address ?? derivedAta,
    admin,
  })
  if (!ensured.ok) throw new Error(ensured.error)

  if (String(wallet.associated_token_account_address ?? "").trim() !== ensured.ata) {
    await admin
      .from("wallet_accounts")
      .update({
        associated_token_account_address: ensured.ata,
        updated_at: new Date().toISOString(),
      })
      .eq("id", wallet.id)
  }

  return { ata: ensured.ata }
}
