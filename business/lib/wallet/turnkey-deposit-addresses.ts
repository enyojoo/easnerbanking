import type { SupabaseClient } from "@supabase/supabase-js"
import type { NoahAccountContext } from "@/lib/noah/resolve-account-context"
import { getActiveWalletAddress } from "@/lib/wallet/turnkey-wallet-db"
import { getWalletOwnerId } from "@/lib/wallet/resolve-wallet-owner"
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

function ownerRefFromContext(ctx: NoahAccountContext): {
  ownerType: "individual" | "business"
  ownerRef: string
} {
  const ownerType: "individual" | "business" = ctx.scope === "business" ? "business" : "individual"
  const ownerRef =
    ctx.scope === "business" && ctx.subjectBusinessId ? ctx.subjectBusinessId : ctx.subjectUserId
  return { ownerType, ownerRef }
}

/**
 * Active Solana USDC / EURC receive addresses from `wallet_accounts` (Turnkey vaults).
 */
export async function getTurnkeyDepositAddressesForContext(
  admin: SupabaseClient,
  ctx: NoahAccountContext,
): Promise<TurnkeyDepositAddressesResponse> {
  const { ownerType, ownerRef } = ownerRefFromContext(ctx)
  const ownerId = await getWalletOwnerId(admin, ownerType, ownerRef)
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
  const ownerId = await getWalletOwnerId(admin, "business", businessId)
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
