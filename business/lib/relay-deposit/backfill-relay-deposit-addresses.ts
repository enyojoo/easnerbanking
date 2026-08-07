import type { SupabaseClient } from "@supabase/supabase-js"
import { isRelayTronInboundEnabled, requireRelayTronPlatformAddress } from "@/lib/relay/config"
import { enqueueRelayDepositProvisionJob, processRelayDepositProvisionJobs } from "./provision-jobs"
import { needsRelayDepositRecipientReprovision } from "./recipient"

const ROUTE = "tron_usdt_to_sol_usdc"

export type BackfillRelayDepositAddressesResult = {
  candidates: number
  alreadyActive: number
  legacyReprovision: number
  missingAta: number
  enqueued: number
  skipped: number
  processed: number
  failures: Array<{ walletOwnerId: string; reason: string }>
}

/**
 * Enqueue (and optionally process) Relay Tron USDT deposit addresses for every
 * active Solana USDC vault that does not already have an active relay address.
 */
export async function backfillRelayDepositAddresses(
  admin: SupabaseClient,
  options?: {
    dryRun?: boolean
    limit?: number
    processJobs?: boolean
    processBatchSize?: number
    maxProcessRounds?: number
  },
): Promise<BackfillRelayDepositAddressesResult> {
  const dryRun = Boolean(options?.dryRun)
  const limit = Math.max(1, Math.min(options?.limit ?? 500, 5_000))
  const processJobs = Boolean(options?.processJobs) && !dryRun
  const processBatchSize = Math.max(1, Math.min(options?.processBatchSize ?? 10, 50))
  const maxProcessRounds = Math.max(1, Math.min(options?.maxProcessRounds ?? 200, 2_000))

  const result: BackfillRelayDepositAddressesResult = {
    candidates: 0,
    alreadyActive: 0,
    legacyReprovision: 0,
    missingAta: 0,
    enqueued: 0,
    skipped: 0,
    processed: 0,
    failures: [],
  }

  if (!isRelayTronInboundEnabled()) {
    throw new Error("relay_not_configured")
  }
  // Fail fast if platform Tron address is missing (required for provision).
  requireRelayTronPlatformAddress()

  const { data: vaults, error: vaultErr } = await admin
    .from("wallet_accounts")
    .select("id, wallet_owner_id, address, associated_token_account_address")
    .eq("chain", "solana")
    .eq("asset", "USDC")
    .eq("status", "active")
    .order("created_at", { ascending: true })
    .limit(limit)

  if (vaultErr) throw vaultErr

  const ownerIds = Array.from(
    new Set(
      (vaults ?? [])
        .map((v) => String(v.wallet_owner_id ?? "").trim())
        .filter(Boolean),
    ),
  )

  const activeOwnerIds = new Set<string>()
  if (ownerIds.length > 0) {
    const { data: existing } = await admin
      .from("relay_deposit_addresses")
      .select("wallet_owner_id, status")
      .eq("route", ROUTE)
      .in("wallet_owner_id", ownerIds)
    for (const row of existing ?? []) {
      if (String(row.status ?? "").trim() === "active") {
        activeOwnerIds.add(String(row.wallet_owner_id))
      }
    }
  }

  for (const vault of vaults ?? []) {
    const walletOwnerId = String(vault.wallet_owner_id ?? "").trim()
    const vaultAddress = String(vault.address ?? "").trim()
    if (!walletOwnerId) {
      result.skipped += 1
      continue
    }
    result.candidates += 1

    if (!vaultAddress) {
      result.missingAta += 1
      result.failures.push({ walletOwnerId, reason: "missing_vault_address" })
      continue
    }

    if (activeOwnerIds.has(walletOwnerId)) {
      const { data: existingRow } = await admin
        .from("relay_deposit_addresses")
        .select("recipient_vault_ata")
        .eq("wallet_owner_id", walletOwnerId)
        .eq("route", ROUTE)
        .eq("status", "active")
        .maybeSingle()
      const stored = String(existingRow?.recipient_vault_ata ?? "").trim()
      if (!needsRelayDepositRecipientReprovision(stored, vaultAddress)) {
        result.alreadyActive += 1
        continue
      }
      result.legacyReprovision += 1
    }

    if (dryRun) {
      result.enqueued += 1
      continue
    }

    try {
      await enqueueRelayDepositProvisionJob(admin, {
        walletOwnerId,
        recipientVaultAddress: vaultAddress,
      })
      result.enqueued += 1
    } catch (e) {
      result.failures.push({
        walletOwnerId,
        reason: e instanceof Error ? e.message : String(e),
      })
    }
  }

  if (processJobs) {
    for (let round = 0; round < maxProcessRounds; round += 1) {
      const { processed } = await processRelayDepositProvisionJobs(admin, processBatchSize)
      result.processed += processed
      if (processed === 0) break
    }
  }

  return result
}
