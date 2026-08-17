import type { SupabaseClient } from "@supabase/supabase-js"
import { hasActiveGridVirtualAccountForBusinessInDb } from "@/lib/noah/virtual-accounts-db"
import { getWalletOwnerId } from "@/lib/wallet/resolve-wallet-owner"

export type GridBusinessProvisionNeeds = {
  needsTurnkeyVaults: boolean
  needsUsdVirtualAccount: boolean
}

/**
 * True when KYB is approved but Turnkey deposit vaults are not ready yet.
 */
export async function needsBusinessTurnkeyVaultProvision(
  admin: SupabaseClient,
  input: { businessId: string },
): Promise<boolean> {
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

/** True when KYB is approved but no active USD fiat VA exists for the business. */
export async function needsGridBusinessUsdVirtualAccountProvision(
  admin: SupabaseClient,
  input: { businessId: string },
): Promise<boolean> {
  const hasUsdVa = await hasActiveGridVirtualAccountForBusinessInDb(admin, {
    currency: "usd",
    businessId: input.businessId,
  })
  return !hasUsdVa
}

export async function resolveGridBusinessProvisionNeeds(
  admin: SupabaseClient,
  input: { businessId: string; userId: string },
): Promise<GridBusinessProvisionNeeds> {
  const [needsTurnkeyVaults, needsUsdVirtualAccount] = await Promise.all([
    needsBusinessTurnkeyVaultProvision(admin, { businessId: input.businessId }),
    needsGridBusinessUsdVirtualAccountProvision(admin, input),
  ])
  return { needsTurnkeyVaults, needsUsdVirtualAccount }
}

/**
 * True when KYB is approved but Turnkey vaults or Grid USD receive details are not ready.
 */
export async function needsBusinessProvisionAfterApproval(
  admin: SupabaseClient,
  input: { businessId: string; userId: string },
): Promise<boolean> {
  const needs = await resolveGridBusinessProvisionNeeds(admin, input)
  return needs.needsTurnkeyVaults || needs.needsUsdVirtualAccount
}
