import type { SupabaseClient } from "@supabase/supabase-js"
import { DEFAULT_INDIVIDUAL_VAULTS, vaultIdempotencyKey, type WalletVaultSpec } from "@/lib/wallet/vault-spec"

export type WalletOwnerRow = {
  id: string
  owner_type: string
  owner_ref: string
  kyc_status: string | null
  noah_customer_id: string | null
  turnkey_sub_organization_id: string | null
  turnkey_da_user_id: string | null
}

export async function upsertWalletOwnerFromNoah(
  admin: SupabaseClient,
  params: {
    ownerType: "individual" | "business"
    ownerRef: string
    noahCustomerId: string
    kycStatus: string
  },
): Promise<WalletOwnerRow> {
  const { data, error } = await admin
    .from("wallet_owners")
    .upsert(
      {
        owner_type: params.ownerType,
        owner_ref: params.ownerRef,
        noah_customer_id: params.noahCustomerId,
        kyc_status: params.kycStatus,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "owner_type,owner_ref" },
    )
    .select("*")
    .single()
  if (error) throw error
  return data as WalletOwnerRow
}

export async function enqueueVaultProvisioningJobs(
  admin: SupabaseClient,
  walletOwnerId: string,
  vaults: WalletVaultSpec[] = DEFAULT_INDIVIDUAL_VAULTS,
): Promise<void> {
  for (const v of vaults) {
    const idempotencyKey = vaultIdempotencyKey(walletOwnerId, v)
    const { data: existing } = await admin
      .from("wallet_accounts")
      .select("id")
      .eq("wallet_owner_id", walletOwnerId)
      .eq("chain", v.chain)
      .eq("asset", v.asset)
      .eq("ledger_currency", v.ledgerCurrency)
      .eq("status", "active")
      .maybeSingle()
    if (existing?.id) continue

    await admin.from("wallet_provisioning_jobs").upsert(
      {
        idempotency_key: idempotencyKey,
        wallet_owner_id: walletOwnerId,
        chain: v.chain,
        asset: v.asset,
        ledger_currency: v.ledgerCurrency,
        state: "pending",
        updated_at: new Date().toISOString(),
      },
      { onConflict: "idempotency_key" },
    )
  }
}

export async function getActiveWalletAddress(
  admin: SupabaseClient,
  walletOwnerId: string,
  chain: string,
  asset: string,
  ledgerCurrency: string,
): Promise<string | null> {
  const { data } = await admin
    .from("wallet_accounts")
    .select("address")
    .eq("wallet_owner_id", walletOwnerId)
    .eq("chain", chain)
    .eq("asset", asset)
    .eq("ledger_currency", ledgerCurrency)
    .eq("status", "active")
    .maybeSingle()
  const raw = data?.address != null ? String(data.address).trim() : ""
  return raw.length > 0 ? raw : null
}

/**
 * Persist Turnkey sub-org on `wallet_owners` and enqueue Solana vault jobs.
 * Preserves existing `kyc_status` when the row already exists.
 */
export async function linkTurnkeySubOrganizationAndEnqueueVaults(
  admin: SupabaseClient,
  params: {
    ownerType: "individual" | "business"
    ownerRef: string
    turnkeySubOrganizationId: string
    noahCustomerId: string
    turnkeyDaUserId?: string | null
  },
): Promise<{ walletOwnerId: string }> {
  const { ownerType, ownerRef, turnkeySubOrganizationId, noahCustomerId, turnkeyDaUserId } = params
  const now = new Date().toISOString()
  const daUserId = String(turnkeyDaUserId ?? "").trim() || null

  const { data: existing } = await admin
    .from("wallet_owners")
    .select("kyc_status, turnkey_da_user_id")
    .eq("owner_type", ownerType)
    .eq("owner_ref", ownerRef)
    .maybeSingle()

  const { data: owner, error } = await admin
    .from("wallet_owners")
    .upsert(
      {
        owner_type: ownerType,
        owner_ref: ownerRef,
        turnkey_sub_organization_id: turnkeySubOrganizationId,
        ...(daUserId ? { turnkey_da_user_id: daUserId } : {}),
        noah_customer_id: noahCustomerId,
        kyc_status: (existing?.kyc_status as string | null | undefined) ?? null,
        updated_at: now,
      },
      { onConflict: "owner_type,owner_ref" },
    )
    .select("id")
    .single()

  if (error || !owner?.id) {
    throw new Error(error?.message || "wallet_owners upsert failed")
  }

  const walletOwnerId = String(owner.id)

  await admin
    .from("wallet_provisioning_jobs")
    .update({
      state: "pending",
      error: null,
      updated_at: now,
    })
    .eq("wallet_owner_id", walletOwnerId)
    .eq("state", "awaiting_sub_org")

  await enqueueVaultProvisioningJobs(admin, walletOwnerId, DEFAULT_INDIVIDUAL_VAULTS)

  return { walletOwnerId }
}
