import type { SupabaseClient } from "@supabase/supabase-js"
import type { NoahAccountContext } from "@/lib/noah/resolve-account-context"
import { noahCustomerIdFromBusinessId } from "@/lib/noah/customer-id"
import { deriveStablecoinAssociatedTokenAddress } from "@/lib/solana/ata"
import { resolveWalletOwnerIdForEasnerContext } from "@/lib/wallet/resolve-wallet-owner"
import { DEFAULT_INDIVIDUAL_VAULTS, type WalletVaultSpec } from "@/lib/wallet/vault-spec"

export type TurnkeyDepositLine = {
  /** SPL token account (ATA) for deposits — from DB or derived from owner + mint. */
  address: string
  /** Turnkey wallet pubkey; same as `wallet_accounts.address`. Not for deposit UX — use `address` (ATA). */
  ownerAddress: string
  stablecoin: string
  chain: string
  memo: string
}

export type TurnkeyDepositAddressesResponse = {
  USD: TurnkeyDepositLine
  EUR: TurnkeyDepositLine
}

const emptyLine = (stablecoin: string): TurnkeyDepositLine => ({
  address: "",
  ownerAddress: "",
  stablecoin,
  chain: "Solana",
  memo: "",
})

async function depositLineForVault(
  admin: SupabaseClient,
  walletOwnerId: string,
  vault: WalletVaultSpec,
): Promise<TurnkeyDepositLine> {
  const label = vault.asset === "EURC" ? "EURC" : "USDC"
  const { data } = await admin
    .from("wallet_accounts")
    .select("id,address,associated_token_account_address")
    .eq("wallet_owner_id", walletOwnerId)
    .eq("chain", vault.chain)
    .eq("asset", vault.asset)
    .eq("ledger_currency", vault.ledgerCurrency)
    .eq("status", "active")
    .maybeSingle()

  const ownerAddr = String(data?.address || "").trim()
  if (!ownerAddr) {
    return emptyLine(label)
  }
  const ataStored = String(data?.associated_token_account_address || "").trim()
  const derivedAta = deriveStablecoinAssociatedTokenAddress(ownerAddr, vault.asset)
  const ata = ataStored || derivedAta || ownerAddr

  if (data?.id && !ataStored && derivedAta) {
    const now = new Date().toISOString()
    await admin
      .from("wallet_accounts")
      .update({ associated_token_account_address: derivedAta, updated_at: now })
      .eq("id", data.id)
  }

  return {
    address: ata,
    ownerAddress: ownerAddr,
    stablecoin: label,
    chain: "Solana",
    memo: "",
  }
}

/**
 * Active Solana USDC / EURC deposit addresses (ATA) from `wallet_accounts`.
 * When `associated_token_account_address` is missing, derives ATA from owner + mint,
 * returns it as `address`, and persists it on the row (same derivation as backfill).
 */
export async function getTurnkeyDepositAddressesForContext(
  admin: SupabaseClient,
  ctx: NoahAccountContext,
): Promise<TurnkeyDepositAddressesResponse> {
  const ownerId = await resolveWalletOwnerIdForEasnerContext(admin, ctx)
  if (!ownerId) {
    return { USD: emptyLine("USDC"), EUR: emptyLine("EURC") }
  }

  const usdcVault = DEFAULT_INDIVIDUAL_VAULTS.find((v) => v.asset === "USDC")
  const eurcVault = DEFAULT_INDIVIDUAL_VAULTS.find((v) => v.asset === "EURC")
  if (!usdcVault || !eurcVault) {
    return { USD: emptyLine("USDC"), EUR: emptyLine("EURC") }
  }

  const [usd, eur] = await Promise.all([
    depositLineForVault(admin, ownerId, usdcVault),
    depositLineForVault(admin, ownerId, eurcVault),
  ])

  return { USD: usd, EUR: eur }
}

/** Invoice pay-in and other server paths keyed only by Easner business id. */
export async function getTurnkeyDepositAddressesForBusiness(
  admin: SupabaseClient,
  businessId: string,
): Promise<TurnkeyDepositAddressesResponse> {
  const { data: biz } = await admin
    .from("businesses")
    .select("noah_customer_id")
    .eq("id", businessId)
    .maybeSingle()
  const noahId =
    String(biz?.noah_customer_id ?? "").trim() || noahCustomerIdFromBusinessId(businessId)

  const ownerId = await resolveWalletOwnerIdForEasnerContext(admin, {
    scope: "business",
    customerType: "Business",
    noahCustomerId: noahId,
    subjectBusinessId: businessId,
    subjectUserId: businessId,
  })
  if (!ownerId) {
    return { USD: emptyLine("USDC"), EUR: emptyLine("EURC") }
  }

  const usdcVault = DEFAULT_INDIVIDUAL_VAULTS.find((v) => v.asset === "USDC")
  const eurcVault = DEFAULT_INDIVIDUAL_VAULTS.find((v) => v.asset === "EURC")
  if (!usdcVault || !eurcVault) {
    return { USD: emptyLine("USDC"), EUR: emptyLine("EURC") }
  }

  const [usd, eur] = await Promise.all([
    depositLineForVault(admin, ownerId, usdcVault),
    depositLineForVault(admin, ownerId, eurcVault),
  ])

  return { USD: usd, EUR: eur }
}
