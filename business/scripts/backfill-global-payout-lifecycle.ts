/**
 * Backfill global payout lifecycle metadata from `event_inbox` Transaction webhooks.
 *
 * Usage:
 *   cd business && node --env-file=.env.local --import tsx scripts/backfill-global-payout-lifecycle.ts --dry-run
 */
import { createClient } from "@supabase/supabase-js"
import { mergeGlobalPayoutLifecycleMetadata } from "../lib/noah/bank-onramp-tx"
import { fetchGlobalPayoutLifecycleFromWebhooks } from "../lib/noah/global-payout-webhook-timestamps"

const dryRun = process.argv.includes("--dry-run")

function isGlobalPayoutOutRow(meta: Record<string, unknown>): boolean {
  return (
    String(meta.payout_type ?? "").toLowerCase() === "global_fiat" ||
    String(meta.flow ?? "").toLowerCase() === "global_fiat_offramp"
  )
}

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
    .select("id, status, metadata, created_at")
    .eq("provider", "noah")
    .eq("direction", "out")

  if (error) throw error

  let patched = 0
  for (const row of rows ?? []) {
    const meta = (row.metadata as Record<string, unknown>) ?? {}
    if (!isGlobalPayoutOutRow(meta)) continue

    const easnerPayoutId = String(meta.easner_payout_id ?? "").trim()
    if (!easnerPayoutId) continue

    const startedAt = String(
      meta.transaction_started_at ?? row.created_at ?? "",
    ).trim()
    const webhook = await fetchGlobalPayoutLifecycleFromWebhooks(admin, easnerPayoutId)

    const merged = mergeGlobalPayoutLifecycleMetadata(meta, {
      transaction_started_at: startedAt || null,
      processing_at: webhook.processingAt,
      completed_at: webhook.completedAt,
      failed_at: webhook.failedAt,
    })

    const unchanged =
      merged.transaction_started_at === meta.transaction_started_at &&
      merged.completed_at === meta.completed_at &&
      merged.failed_at === meta.failed_at &&
      merged.processing_at === meta.processing_at

    if (unchanged) continue

    if (dryRun) {
      console.log("would patch", row.id, {
        transaction_started_at: merged.transaction_started_at,
        processing_at: merged.processing_at,
        completed_at: merged.completed_at,
        failed_at: merged.failed_at,
      })
    } else {
      await admin.from("transactions").update({ metadata: merged }).eq("id", row.id)
    }
    patched++
  }

  console.log(dryRun ? `Dry run: ${patched} rows` : `Patched ${patched} rows`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
