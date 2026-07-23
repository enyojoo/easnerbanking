import type { SupabaseClient } from "@supabase/supabase-js"
import type { NoahAccountContext } from "@/lib/noah/resolve-account-context"
import { noahCustomerIdFromBusinessId } from "@/lib/noah/customer-id"
import { deriveStablecoinAssociatedTokenAddress } from "@/lib/solana/ata"
import { verifyStablecoinTokenAccount } from "@/lib/solana/verify-token-account"
import { ensureStablecoinTokenAccountOnChain } from "@/lib/turnkey/ensure-spl-token-account"
import { resolveWalletOwnerIdForEasnerContext } from "@/lib/wallet/resolve-wallet-owner"
import { DEFAULT_INDIVIDUAL_VAULTS, type WalletVaultSpec } from "@/lib/wallet/vault-spec"

export type TurnkeyDepositLine = {
  /** SPL token account (ATA) for USDC/EURC deposits — only returned after on-chain ATA is verified. */
  address: string
  /** Turnkey Solana vault (wallet signer). Use for Noah on-chain workflows, not raw SPL deposits. */
  ownerAddress: string
  stablecoin: string
  chain: string
  memo: string
  /** True when ATA exists on-chain with owner = vault; false while initialization is pending. */
  ataReady?: boolean
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
  opts?: { mode?: "fast" | "ensure" },
): Promise<TurnkeyDepositLine> {
  const mode = opts?.mode === "fast" ? "fast" : "ensure"
  const label = vault.asset === "EURC" ? "EURC" : "USDC"
  const { data } = await admin
    .from("wallet_accounts")
    .select("id,address,associated_token_account_address,turnkey_sub_organization_id,wallet_owner_id")
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
  if (!derivedAta) {
    return { ...emptyLine(label), ownerAddress: ownerAddr }
  }

  if (data?.id && (!ataStored || ataStored !== derivedAta)) {
    const now = new Date().toISOString()
    await admin
      .from("wallet_accounts")
      .update({ associated_token_account_address: derivedAta, updated_at: now })
      .eq("id", data.id)
  }

  // Warm path: trust DB/derived ATA without Solana verify or Turnkey ensure.
  if (mode === "fast") {
    const readyAta = ataStored || derivedAta
    return {
      address: readyAta,
      ownerAddress: ownerAddr,
      stablecoin: label,
      chain: "Solana",
      memo: "",
      ataReady: Boolean(ataStored),
    }
  }

  let subOrgId = String(data?.turnkey_sub_organization_id || "").trim()
  if (!subOrgId && data?.wallet_owner_id) {
    const { data: wo } = await admin
      .from("wallet_owners")
      .select("turnkey_sub_organization_id")
      .eq("id", data.wallet_owner_id)
      .maybeSingle()
    subOrgId = String(wo?.turnkey_sub_organization_id || "").trim()
  }

  let ataReady = false
  let depositAddress = ""

  const verified = await verifyStablecoinTokenAccount(
    derivedAta,
    ownerAddr,
    vault.asset as "USDC" | "EURC",
  )
  if (verified.ok) {
    ataReady = true
    depositAddress = derivedAta
  } else if (subOrgId) {
    const ensured = await ensureStablecoinTokenAccountOnChain({
      subOrgId,
      vaultAddress: ownerAddr,
      asset: vault.asset as "USDC" | "EURC",
      expectedAta: derivedAta,
    })
    if (ensured.ok) {
      ataReady = true
      depositAddress = ensured.ata
    }
  }

  return {
    address: depositAddress,
    ownerAddress: ownerAddr,
    stablecoin: label,
    chain: "Solana",
    memo: "",
    ataReady,
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
  opts?: { mode?: "fast" | "ensure" },
): Promise<TurnkeyDepositAddressesResponse> {
  const mode = opts?.mode === "fast" ? "fast" : "ensure"
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
    depositLineForVault(admin, ownerId, usdcVault, { mode }),
    depositLineForVault(admin, ownerId, eurcVault, { mode }),
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
