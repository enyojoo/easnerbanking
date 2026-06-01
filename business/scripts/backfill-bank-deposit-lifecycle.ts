/**
 * Backfill bank on-ramp lifecycle timestamps on pay-in rows from `event_inbox`.
 *
 * - `processing_at` ← FiatDeposit Pending
 * - `fiat_settled_at` ← FiatDeposit Settled (funding)
 * - `on_chain_settled_at` / `completed_at` ← orchestration Out Settled (funds to wallet)
 *
 * Usage:
 *   cd business && node --env-file=.env.local --import tsx scripts/backfill-bank-deposit-lifecycle.ts --dry-run
 */
import { createClient } from "@supabase/supabase-js"
import { isVerificationDepositMetadata } from "@easner/shared/transactions/verification-deposit"
import {
  extractNoahBankPayInEnrichment,
  isNoahBankOnrampFiatPayIn,
  mergePayInMetadataWithLifecycle,
} from "../lib/noah/bank-onramp-tx"
import { fetchBankOnrampOrchestrationOutFromWebhooks } from "../lib/noah/bank-onramp-orchestration-out-webhook-timestamps"
import { fetchFiatDepositWebhooksByDepositIds } from "../lib/noah/fiat-deposit-webhook-timestamps"

const dryRun = process.argv.includes("--dry-run")

async function main() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    console.error("Missing SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY")
    process.exit(1)
  }
  const admin = createClient(url, key)

  const { data: rows, error } = await admin
    .from("transactions")
    .select("id, status, metadata, payload, occurred_at, settled_at, created_at, tx_hash")
    .eq("provider", "noah")
    .eq("direction", "in")

  if (error) throw error

  let patched = 0
  for (const row of rows ?? []) {
    const payload = row.payload as Record<string, unknown> | null
    if (!payload || !isNoahBankOnrampFiatPayIn(payload)) continue
    const meta = (row.metadata as Record<string, unknown>) ?? {}
    const isVerification = isVerificationDepositMetadata(meta)

    const enrichment = extractNoahBankPayInEnrichment(payload)
    const depositId = String(
      meta.noah_fiat_deposit_id ?? meta.noah_rule_execution_id ?? enrichment?.ruleExecutionId ?? "",
    ).trim()
    if (!depositId) continue

    const [fiatMap, orchOut] = await Promise.all([
      fetchFiatDepositWebhooksByDepositIds(admin, [depositId]),
      fetchBankOnrampOrchestrationOutFromWebhooks(admin, depositId),
    ])
    const fiatTs = fiatMap.get(depositId)

    let processingAt =
      meta.processing_at != null ? String(meta.processing_at) : fiatTs?.processingAt ?? null
    let fiatSettledAt = meta.fiat_settled_at != null ? String(meta.fiat_settled_at) : null
    let onChainSettledAt =
      meta.on_chain_settled_at != null ? String(meta.on_chain_settled_at) : orchOut.onChainSettledAt

    if (fiatTs?.processingAt) processingAt = fiatTs.processingAt
    if (!isVerification && fiatTs?.completedAt) {
      fiatSettledAt = fiatSettledAt ?? fiatTs.completedAt
    }
    if (isVerification && fiatTs?.completedAt) {
      onChainSettledAt = onChainSettledAt ?? fiatTs.completedAt
    }
    if (!onChainSettledAt && orchOut.onChainSettledAt) {
      onChainSettledAt = orchOut.onChainSettledAt
    }

    if (!processingAt) {
      processingAt = String(row.occurred_at ?? row.created_at ?? "")
    }

    const lifecyclePatch = isVerification
      ? {
          processing_at: processingAt,
          completed_at: onChainSettledAt ?? fiatTs?.completedAt ?? meta.completed_at ?? null,
          noah_fiat_deposit_id: depositId,
        }
      : {
          processing_at: processingAt,
          fiat_settled_at: fiatSettledAt,
          on_chain_settled_at: onChainSettledAt,
          noah_fiat_deposit_id: depositId,
        }

    const merged = mergePayInMetadataWithLifecycle(meta, { flow: "bank_onramp" }, lifecyclePatch)

    const txHash =
      String(row.tx_hash ?? "").trim() ||
      orchOut.solanaTxHash ||
      (typeof merged.noah_on_chain_tx_hash === "string" ? merged.noah_on_chain_tx_hash : null)

    const unchanged =
      merged.processing_at === meta.processing_at &&
      merged.fiat_settled_at === meta.fiat_settled_at &&
      merged.on_chain_settled_at === meta.on_chain_settled_at &&
      merged.completed_at === meta.completed_at &&
      (!txHash || txHash === String(row.tx_hash ?? "").trim())

    if (unchanged) continue

    if (dryRun) {
      console.log("would patch", row.id, {
        processing_at: merged.processing_at,
        fiat_settled_at: merged.fiat_settled_at,
        on_chain_settled_at: merged.on_chain_settled_at,
        completed_at: merged.completed_at,
        tx_hash: txHash || undefined,
      })
    } else {
      await admin
        .from("transactions")
        .update({
          metadata: merged,
          ...(txHash ? { tx_hash: txHash } : {}),
          updated_at: new Date().toISOString(),
        })
        .eq("id", row.id)
    }
    patched++
  }

  console.log(dryRun ? `Dry run: ${patched} rows` : `Patched ${patched} rows`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
