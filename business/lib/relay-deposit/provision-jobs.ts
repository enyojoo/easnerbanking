import type { SupabaseClient } from "@supabase/supabase-js"
import { isRelayTronInboundEnabled } from "@/lib/relay/config"
import { provisionRelayDepositAddress } from "./provision-address"
import { needsRelayDepositRecipientReprovision, relayDepositRecipientFromVault } from "./recipient"

const MAX_ATTEMPTS = 5
const BACKOFF_MS = 5000
const ROUTE = "tron_usdt_to_sol_usdc"

export async function enqueueRelayDepositProvisionJob(
  admin: SupabaseClient,
  input: { walletOwnerId: string; recipientVaultAddress: string },
): Promise<void> {
  if (!isRelayTronInboundEnabled()) return

  const walletOwnerId = String(input.walletOwnerId || "").trim()
  const recipientVaultAddress = relayDepositRecipientFromVault(input.recipientVaultAddress)
  if (!walletOwnerId || !recipientVaultAddress) return

  const { data: existing } = await admin
    .from("relay_deposit_addresses")
    .select("id, status, recipient_vault_ata")
    .eq("wallet_owner_id", walletOwnerId)
    .eq("route", ROUTE)
    .maybeSingle()

  if (
    existing?.status === "active" &&
    !needsRelayDepositRecipientReprovision(
      String(existing.recipient_vault_ata ?? ""),
      recipientVaultAddress,
    )
  ) {
    return
  }

  const { data: pendingJob } = await admin
    .from("relay_deposit_provision_jobs")
    .select("id, state")
    .eq("wallet_owner_id", walletOwnerId)
    .eq("route", ROUTE)
    .in("state", ["pending", "retry"])
    .maybeSingle()

  if (pendingJob) return

  await admin.from("relay_deposit_provision_jobs").insert({
    wallet_owner_id: walletOwnerId,
    recipient_vault_ata: recipientVaultAddress,
    route: ROUTE,
    state: "pending",
    attempt_count: 0,
  })
}

export async function processRelayDepositProvisionJobs(
  admin: SupabaseClient,
  limit = 10,
  options?: { walletOwnerId?: string },
): Promise<{ processed: number }> {
  if (!isRelayTronInboundEnabled()) return { processed: 0 }

  const now = new Date().toISOString()
  const ownerId = String(options?.walletOwnerId ?? "").trim()
  let query = admin
    .from("relay_deposit_provision_jobs")
    .select("*")
    .in("state", ["pending", "retry"])
    .or(`next_retry_at.is.null,next_retry_at.lte.${now}`)
  if (ownerId) query = query.eq("wallet_owner_id", ownerId)
  const { data: jobs } = await query.order("created_at", { ascending: true }).limit(limit)

  let processed = 0
  for (const job of jobs ?? []) {
    processed += 1
    try {
      await provisionRelayDepositAddress(admin, {
        walletOwnerId: String(job.wallet_owner_id),
        recipientVaultAddress: String(job.recipient_vault_ata),
      })
      await admin
        .from("relay_deposit_provision_jobs")
        .update({ state: "completed", error: null, updated_at: now })
        .eq("id", job.id)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      const attempts = Number(job.attempt_count ?? 0) + 1
      const terminal = attempts >= MAX_ATTEMPTS
      await admin
        .from("relay_deposit_provision_jobs")
        .update({
          state: terminal ? "dead_letter" : "retry",
          error: msg,
          attempt_count: attempts,
          next_retry_at: terminal ? null : new Date(Date.now() + BACKOFF_MS * attempts).toISOString(),
          updated_at: now,
        })
        .eq("id", job.id)
    }
  }

  return { processed }
}
