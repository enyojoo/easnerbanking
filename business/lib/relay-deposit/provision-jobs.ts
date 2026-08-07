import type { SupabaseClient } from "@supabase/supabase-js"
import { isRelayTronInboundEnabled } from "@/lib/relay/config"
import { provisionRelayDepositAddress } from "./provision-address"

const MAX_ATTEMPTS = 5
const BACKOFF_MS = 5000
const ROUTE = "tron_usdt_to_sol_usdc"

export async function enqueueRelayDepositProvisionJob(
  admin: SupabaseClient,
  input: { walletOwnerId: string; recipientVaultAta: string },
): Promise<void> {
  if (!isRelayTronInboundEnabled()) return

  const walletOwnerId = String(input.walletOwnerId || "").trim()
  const recipientVaultAta = String(input.recipientVaultAta || "").trim()
  if (!walletOwnerId || !recipientVaultAta) return

  const { data: existing } = await admin
    .from("relay_deposit_addresses")
    .select("id, status")
    .eq("wallet_owner_id", walletOwnerId)
    .eq("route", ROUTE)
    .maybeSingle()

  if (existing?.status === "active") return

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
    recipient_vault_ata: recipientVaultAta,
    route: ROUTE,
    state: "pending",
    attempt_count: 0,
  })
}

export async function processRelayDepositProvisionJobs(
  admin: SupabaseClient,
  limit = 10,
): Promise<{ processed: number }> {
  if (!isRelayTronInboundEnabled()) return { processed: 0 }

  const now = new Date().toISOString()
  const { data: jobs } = await admin
    .from("relay_deposit_provision_jobs")
    .select("*")
    .in("state", ["pending", "retry"])
    .or(`next_retry_at.is.null,next_retry_at.lte.${now}`)
    .order("created_at", { ascending: true })
    .limit(limit)

  let processed = 0
  for (const job of jobs ?? []) {
    processed += 1
    try {
      await provisionRelayDepositAddress(admin, {
        walletOwnerId: String(job.wallet_owner_id),
        recipientVaultAta: String(job.recipient_vault_ata),
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
