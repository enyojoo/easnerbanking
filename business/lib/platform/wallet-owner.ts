import type { SupabaseClient } from "@supabase/supabase-js"
import { isTurnkeyConfigured, isTurnkeyWalletAutoprovisionEnabled } from "@/lib/turnkey/config"
import { createEasnerTurnkeySubOrganization } from "@/lib/wallet/turnkey-create-sub-org"
import { processNextWalletProvisioningJob } from "@/lib/wallet/turnkey-provisioning"
import { enqueueVaultProvisioningJobs, type WalletOwnerRow } from "@/lib/wallet/turnkey-wallet-db"
import { DEFAULT_INDIVIDUAL_VAULTS } from "@/lib/wallet/vault-spec"

export const PLATFORM_OWNER_TYPE = "platform"
export const PLATFORM_CUSTOMER_OWNER_TYPE = "platform_customer"

async function upsertOwner(
  admin: SupabaseClient,
  ownerType: string,
  ownerRef: string,
): Promise<WalletOwnerRow> {
  const now = new Date().toISOString()
  const { data, error } = await admin
    .from("wallet_owners")
    .upsert(
      {
        owner_type: ownerType,
        owner_ref: ownerRef,
        updated_at: now,
      },
      { onConflict: "owner_type,owner_ref" },
    )
    .select("*")
    .single()
  if (error || !data) throw new Error(error?.message || "Could not create wallet owner")
  return data as WalletOwnerRow
}

async function provisionSubOrgIfNeeded(
  admin: SupabaseClient,
  owner: WalletOwnerRow,
  input: { name: string; email: string; userName: string },
): Promise<WalletOwnerRow> {
  if (owner.turnkey_sub_organization_id) return owner
  try {
    const created = await createEasnerTurnkeySubOrganization({
      subOrganizationName: input.name,
      userName: input.userName,
      userEmail: input.email,
    })
    const now = new Date().toISOString()
    const { data } = await admin
      .from("wallet_owners")
      .update({
        turnkey_sub_organization_id: created.subOrganizationId,
        turnkey_da_user_id: created.daUserId,
        updated_at: now,
      })
      .eq("id", owner.id)
      .select("*")
      .single()
    const next = (data as WalletOwnerRow | null) ?? owner
    await provisionPlatformCustomerVaults(admin, next.id)
    return next
  } catch (error) {
    console.warn("[platform] turnkey sub-org:", error instanceof Error ? error.message : error)
    return owner
  }
}

/** Open the USD (USDC) and EUR (EURC) Solana vaults for a platform customer. */
export async function provisionPlatformCustomerVaults(
  admin: SupabaseClient,
  walletOwnerId: string,
): Promise<void> {
  const ownerId = String(walletOwnerId ?? "").trim()
  if (!ownerId) return
  if (!isTurnkeyConfigured() || !isTurnkeyWalletAutoprovisionEnabled()) return
  const { data: wo } = await admin
    .from("wallet_owners")
    .select("turnkey_sub_organization_id")
    .eq("id", ownerId)
    .maybeSingle()
  if (!String(wo?.turnkey_sub_organization_id ?? "").trim()) return
  await enqueueVaultProvisioningJobs(admin, ownerId, DEFAULT_INDIVIDUAL_VAULTS)
  for (let i = 0; i < 16; i++) {
    const result = await processNextWalletProvisioningJob({ walletOwnerId: ownerId })
    if (!result.processed || result.detail === "no_jobs") break
  }
}

export async function ensurePlatformWalletOwner(
  admin: SupabaseClient,
  businessId: string,
  input?: { email?: string | null; name?: string | null },
): Promise<WalletOwnerRow> {
  const owner = await upsertOwner(admin, PLATFORM_OWNER_TYPE, businessId)
  const email = String(input?.email ?? "").trim().toLowerCase()
  if (!email.includes("@")) return owner
  return provisionSubOrgIfNeeded(admin, owner, {
    name: `easner-platform-${businessId.slice(0, 8)}`,
    userName: String(input?.name ?? "").trim() || "Platform treasury",
    email,
  })
}

export async function ensurePlatformCustomerWalletOwner(
  admin: SupabaseClient,
  customerId: string,
  input: { email: string; name?: string | null },
): Promise<WalletOwnerRow> {
  const owner = await upsertOwner(admin, PLATFORM_CUSTOMER_OWNER_TYPE, customerId)
  const email = input.email.trim().toLowerCase()
  if (!email.includes("@")) return owner
  return provisionSubOrgIfNeeded(admin, owner, {
    name: `easner-customer-${customerId.slice(0, 12)}`,
    userName: String(input.name ?? "").trim() || "Platform customer",
    email,
  })
}
