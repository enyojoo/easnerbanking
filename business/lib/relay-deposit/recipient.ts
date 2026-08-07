import type { SupabaseClient } from "@supabase/supabase-js"
import { deriveStablecoinAssociatedTokenAddress } from "@/lib/solana/ata"

const ROUTE = "tron_usdt_to_sol_usdc"

export type RelayDepositAddressRow = {
  wallet_owner_id: string
  tron_address: string
  /** Solana vault pubkey (legacy rows may store the SPL ATA). */
  recipient_vault_ata: string
}

/**
 * Relay `recipient` must be the Turnkey vault pubkey — not the SPL ATA.
 * Bridges create/fund the canonical ATA (owner = vault). Passing the ATA makes
 * Relay treat it as an owner and can fund a nested token account Turnkey won't see.
 */
export function relayDepositRecipientFromVault(vaultAddress: string): string {
  return String(vaultAddress || "").trim()
}

/** True when stored recipient is the SPL ATA (or otherwise not the vault pubkey). */
export function needsRelayDepositRecipientReprovision(
  storedRecipient: string,
  vaultAddress: string,
  asset: "USDC" | "EURC" = "USDC",
): boolean {
  const stored = String(storedRecipient || "").trim()
  const vault = relayDepositRecipientFromVault(vaultAddress)
  if (!vault) return false
  if (!stored) return true
  if (stored === vault) return false

  const ata = deriveStablecoinAssociatedTokenAddress(vault, asset)
  if (ata && stored === ata) return true

  return stored !== vault
}

function matchesStoredRecipient(
  stored: string,
  vaultAddress: string,
  ataAddress: string | null,
): boolean {
  const key = stored.trim()
  if (!key) return false
  if (key === vaultAddress) return true
  if (ataAddress && key === ataAddress) return true
  return false
}

/** Resolve active relay deposit address row from vault pubkey, ATA, or stored recipient. */
export async function findActiveRelayDepositAddress(
  admin: SupabaseClient,
  input: { solanaAddress?: string | null; walletOwnerId?: string | null },
): Promise<RelayDepositAddressRow | null> {
  const walletOwnerId = String(input.walletOwnerId ?? "").trim()
  if (walletOwnerId) {
    const { data } = await admin
      .from("relay_deposit_addresses")
      .select("wallet_owner_id, tron_address, recipient_vault_ata")
      .eq("wallet_owner_id", walletOwnerId)
      .eq("route", ROUTE)
      .eq("status", "active")
      .maybeSingle()
    return (data as RelayDepositAddressRow | null) ?? null
  }

  const solanaAddress = String(input.solanaAddress ?? "").trim()
  if (!solanaAddress) return null

  const { data: direct } = await admin
    .from("relay_deposit_addresses")
    .select("wallet_owner_id, tron_address, recipient_vault_ata")
    .eq("recipient_vault_ata", solanaAddress)
    .eq("route", ROUTE)
    .eq("status", "active")
    .maybeSingle()
  if (direct) return direct as RelayDepositAddressRow

  const { data: walletRows } = await admin
    .from("wallet_accounts")
    .select("wallet_owner_id, address, associated_token_account_address")
    .eq("status", "active")
    .eq("chain", "solana")
    .eq("asset", "USDC")
    .or(
      `address.eq.${solanaAddress},associated_token_account_address.eq.${solanaAddress}`,
    )
    .limit(5)

  for (const wallet of walletRows ?? []) {
    const vaultAddress = String(wallet.address ?? "").trim()
    const ata =
      String(wallet.associated_token_account_address ?? "").trim() ||
      deriveStablecoinAssociatedTokenAddress(vaultAddress, "USDC") ||
      ""

    const { data: byOwner } = await admin
      .from("relay_deposit_addresses")
      .select("wallet_owner_id, tron_address, recipient_vault_ata")
      .eq("wallet_owner_id", String(wallet.wallet_owner_id))
      .eq("route", ROUTE)
      .eq("status", "active")
      .maybeSingle()

    if (!byOwner) continue
    const stored = String(byOwner.recipient_vault_ata ?? "").trim()
    if (matchesStoredRecipient(stored, vaultAddress, ata || null)) {
      return byOwner as RelayDepositAddressRow
    }
  }

  return null
}
