import { defaultSolanaAccountAtIndex } from "@turnkey/sdk-server"
import { createSupabaseAdmin } from "@/lib/supabase/admin"
import { getTurnkeyApiClientForSubOrganization } from "@/lib/turnkey/client"
import {
  getTurnkeyFallbackSubOrganizationId,
  isTurnkeyConfigured,
  isTurnkeyWalletAutoprovisionEnabled,
} from "@/lib/turnkey/config"
import { DEFAULT_INDIVIDUAL_VAULTS } from "@/lib/wallet/vault-spec"
import { enqueueVaultProvisioningJobs, upsertWalletOwnerFromNoah } from "@/lib/wallet/turnkey-wallet-db"

const MAX_ATTEMPTS = 5
const BACKOFF_MS = 5000

/**
 * Called after Noah KYC/KYB approved + Noah artifacts provisioned.
 */
export async function scheduleTurnkeyWalletsAfterKycApproved(params: {
  scope: "individual" | "business"
  subjectUserId: string
  subjectBusinessId: string | null
  noahCustomerId: string
}): Promise<void> {
  if (!isTurnkeyWalletAutoprovisionEnabled()) return

  const admin = createSupabaseAdmin()
  const ownerType = params.scope === "business" ? "business" : "individual"
  const ownerRef =
    params.scope === "business" && params.subjectBusinessId
      ? params.subjectBusinessId
      : params.subjectUserId

  const owner = await upsertWalletOwnerFromNoah(admin, {
    ownerType,
    ownerRef,
    noahCustomerId: params.noahCustomerId,
    kycStatus: "approved",
  })

  await enqueueVaultProvisioningJobs(admin, owner.id, DEFAULT_INDIVIDUAL_VAULTS)
}

/**
 * Process a single pending provisioning job (Turnkey createWallet in user sub-org).
 * When `walletOwnerId` is set, only jobs for that `wallet_owners` row are considered.
 */
export async function processNextWalletProvisioningJob(opts?: {
  walletOwnerId?: string
}): Promise<{
  processed: boolean
  jobId?: string
  detail?: string
}> {
  if (!isTurnkeyConfigured() || !isTurnkeyWalletAutoprovisionEnabled()) {
    return { processed: false, detail: "turnkey_not_configured_or_disabled" }
  }

  const admin = createSupabaseAdmin()
  const now = new Date().toISOString()
  let jobQuery = admin
    .from("wallet_provisioning_jobs")
    .select("*, wallet_owners(*)")
    .in("state", ["pending", "retry"])
    .or(`next_retry_at.is.null,next_retry_at.lte.${now}`)
  if (opts?.walletOwnerId) {
    jobQuery = jobQuery.eq("wallet_owner_id", opts.walletOwnerId)
  }
  const { data: job } = await jobQuery.order("created_at", { ascending: true }).limit(1).maybeSingle()

  if (!job?.id) return { processed: false, detail: "no_jobs" }

  const owner = job.wallet_owners as {
    id: string
    turnkey_sub_organization_id: string | null
  } | null
  if (!owner?.id) {
    await admin
      .from("wallet_provisioning_jobs")
      .update({ state: "failed", error: "missing_wallet_owner", updated_at: now })
      .eq("id", job.id)
    return { processed: true, jobId: job.id, detail: "missing_owner" }
  }

  const subOrgId =
    owner.turnkey_sub_organization_id?.trim() || getTurnkeyFallbackSubOrganizationId() || ""
  if (!subOrgId) {
    await admin
      .from("wallet_provisioning_jobs")
      .update({
        state: "awaiting_sub_org",
        error:
          "Set wallet_owners.turnkey_sub_organization_id (from mobile Turnkey signup) or TURNKEY_FALLBACK_SUB_ORGAN_ID for testing.",
        next_retry_at: new Date(Date.now() + 60_000).toISOString(),
        updated_at: now,
      })
      .eq("id", job.id)
    return { processed: true, jobId: job.id, detail: "awaiting_sub_org" }
  }

  const client = getTurnkeyApiClientForSubOrganization(subOrgId)
  if (!client) return { processed: false, detail: "no_client" }

  const walletName = `easner-${job.ledger_currency}-${job.chain}-${job.asset}`.toLowerCase()
  const spec = DEFAULT_INDIVIDUAL_VAULTS.find(
    (v) =>
      v.chain === job.chain &&
      v.asset === job.asset &&
      v.ledgerCurrency === job.ledger_currency,
  )
  const derivationIndex = spec?.derivationIndex ?? 0

  try {
    const res = await client.createWallet({
      organizationId: subOrgId,
      walletName,
      accounts: [defaultSolanaAccountAtIndex(derivationIndex)],
      mnemonicLength: 12,
    } as Parameters<typeof client.createWallet>[0])

    const walletId = String((res as { walletId?: string }).walletId ?? "")
    const addresses = (res as { addresses?: string[] }).addresses
    const address = Array.isArray(addresses) && addresses[0] ? String(addresses[0]) : ""

    if (!walletId || !address) {
      throw new Error("Turnkey createWallet returned no walletId/address")
    }

    await admin.from("wallet_accounts").upsert(
      {
        wallet_owner_id: owner.id,
        turnkey_sub_organization_id: subOrgId,
        turnkey_wallet_id: walletId,
        chain: job.chain,
        asset: job.asset,
        ledger_currency: job.ledger_currency,
        address,
        status: "active",
        is_primary: true,
        activated_at: now,
        updated_at: now,
      },
      { onConflict: "wallet_owner_id,chain,asset,ledger_currency" },
    )

    await admin
      .from("wallet_provisioning_jobs")
      .update({ state: "completed", error: null, updated_at: now })
      .eq("id", job.id)
    return { processed: true, jobId: job.id, detail: "ok" }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    const attempts = Number(job.attempt_count ?? 0) + 1
    const terminal = attempts >= MAX_ATTEMPTS
    await admin
      .from("wallet_provisioning_jobs")
      .update({
        state: terminal ? "dead_letter" : "retry",
        error: msg,
        attempt_count: attempts,
        next_retry_at: terminal ? null : new Date(Date.now() + BACKOFF_MS * attempts).toISOString(),
        updated_at: now,
      })
      .eq("id", job.id)
    return { processed: true, jobId: job.id, detail: terminal ? "dead_letter" : "retry" }
  }
}
