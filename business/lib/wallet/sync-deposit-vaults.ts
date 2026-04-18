import type { SupabaseClient } from "@supabase/supabase-js"
import type { NoahAccountContext } from "@/lib/noah/resolve-account-context"
import {
  isTurnkeyConfigured,
  isTurnkeyWalletAutoprovisionEnabled,
} from "@/lib/turnkey/config"
import { getWalletOwnerId } from "@/lib/wallet/resolve-wallet-owner"
import { enqueueVaultProvisioningJobs } from "@/lib/wallet/turnkey-wallet-db"
import { getTurnkeyDepositAddressesForContext } from "@/lib/wallet/turnkey-deposit-addresses"
import { processNextWalletProvisioningJob } from "@/lib/wallet/turnkey-provisioning"
import { DEFAULT_INDIVIDUAL_VAULTS } from "@/lib/wallet/vault-spec"

const MAX_DRAIN_PASSES = 16

function depositAddressesComplete(
  body: Awaited<ReturnType<typeof getTurnkeyDepositAddressesForContext>>,
): boolean {
  return Boolean(String(body.USD.address ?? "").trim() && String(body.EUR.address ?? "").trim())
}

/**
 * When KYC/KYB is already approved but Solana vault rows are missing (cron lag, webhook order,
 * or jobs stuck in `awaiting_sub_org` until sub-org linked), re-enqueue and drain this owner's
 * provisioning jobs inline so `/accounts` can show addresses without waiting for the worker cron.
 */
export async function trySyncTurnkeyDepositVaultsIfNeeded(
  admin: SupabaseClient,
  ctx: NoahAccountContext,
): Promise<void> {
  if (!isTurnkeyConfigured() || !isTurnkeyWalletAutoprovisionEnabled()) return

  let body = await getTurnkeyDepositAddressesForContext(admin, ctx)
  if (depositAddressesComplete(body)) return

  const ownerType: "individual" | "business" = ctx.scope === "business" ? "business" : "individual"
  const ownerRef =
    ctx.scope === "business" && ctx.subjectBusinessId ? ctx.subjectBusinessId : ctx.subjectUserId

  const ownerId = await getWalletOwnerId(admin, ownerType, ownerRef)
  if (!ownerId) return

  const { data: wo } = await admin
    .from("wallet_owners")
    .select("turnkey_sub_organization_id")
    .eq("id", ownerId)
    .maybeSingle()

  const subOrg = String(wo?.turnkey_sub_organization_id ?? "").trim()
  if (!subOrg) return

  const now = new Date().toISOString()
  await admin
    .from("wallet_provisioning_jobs")
    .update({ state: "pending", error: null, updated_at: now })
    .eq("wallet_owner_id", ownerId)
    .eq("state", "awaiting_sub_org")

  await enqueueVaultProvisioningJobs(admin, ownerId, DEFAULT_INDIVIDUAL_VAULTS)

  for (let i = 0; i < MAX_DRAIN_PASSES; i++) {
    body = await getTurnkeyDepositAddressesForContext(admin, ctx)
    if (depositAddressesComplete(body)) return

    const r = await processNextWalletProvisioningJob({ walletOwnerId: ownerId })
    if (!r.processed || r.detail === "no_jobs") break
  }
}
