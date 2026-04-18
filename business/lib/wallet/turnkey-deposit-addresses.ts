import type { SupabaseClient } from "@supabase/supabase-js"
import type { NoahAccountContext } from "@/lib/noah/resolve-account-context"
import { noahCustomerIdFromBusinessId } from "@/lib/noah/customer-id"
import { getActiveWalletAddress } from "@/lib/wallet/turnkey-wallet-db"
import { resolveWalletOwnerIdForEasnerContext } from "@/lib/wallet/resolve-wallet-owner"
import { DEFAULT_INDIVIDUAL_VAULTS } from "@/lib/wallet/vault-spec"

export type TurnkeyDepositLine = {
  address: string
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
  stablecoin,
  chain: "Solana",
  memo: "",
})

/**
 * Active Solana USDC / EURC receive addresses from `wallet_accounts` (Turnkey vaults).
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

  const [usdAddr, eurAddr] = await Promise.all([
    getActiveWalletAddress(admin, ownerId, usdcVault.chain, usdcVault.asset, usdcVault.ledgerCurrency),
    getActiveWalletAddress(admin, ownerId, eurcVault.chain, eurcVault.asset, eurcVault.ledgerCurrency),
  ])

  return {
    USD: {
      address: usdAddr ?? "",
      stablecoin: "USDC",
      chain: "Solana",
      memo: "",
    },
    EUR: {
      address: eurAddr ?? "",
      stablecoin: "EURC",
      chain: "Solana",
      memo: "",
    },
  }
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

  const [usdAddr, eurAddr] = await Promise.all([
    getActiveWalletAddress(admin, ownerId, usdcVault.chain, usdcVault.asset, usdcVault.ledgerCurrency),
    getActiveWalletAddress(admin, ownerId, eurcVault.chain, eurcVault.asset, eurcVault.ledgerCurrency),
  ])

  return {
    USD: {
      address: usdAddr ?? "",
      stablecoin: "USDC",
      chain: "Solana",
      memo: "",
    },
    EUR: {
      address: eurAddr ?? "",
      stablecoin: "EURC",
      chain: "Solana",
      memo: "",
    },
  }
}
