/**
 * Backfill `metadata.processing_at` / `completed_at` on Noah bank pay-in rows from `event_inbox` FiatDeposit webhooks.
 *
 * For full metadata (sender, narration, deposit_kind), use `backfill-bank-deposit-pay-in.ts`.
 *
 * Usage:
 *   cd business && node --env-file=.env.local --import tsx scripts/backfill-bank-deposit-lifecycle.ts --dry-run
 */
import { createClient } from "@supabase/supabase-js"
import {
  extractNoahBankPayInEnrichment,
  mergePayInMetadataWithLifecycle,
} from "../lib/noah/bank-onramp-tx"
import { isNoahBankOnrampFiatPayIn } from "../lib/noah/bank-onramp-tx"
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
    .select("id, status, metadata, payload, occurred_at, settled_at, created_at")
    .eq("provider", "noah")
    .eq("direction", "in")

  if (error) throw error

  let patched = 0
  for (const row of rows ?? []) {
    const payload = row.payload as Record<string, unknown> | null
    if (!payload || !isNoahBankOnrampFiatPayIn(payload)) continue
    const meta = (row.metadata as Record<string, unknown>) ?? {}
    if (meta.processing_at && meta.completed_at && meta.flow === "bank_onramp") continue

    const enrichment = extractNoahBankPayInEnrichment(payload)
    const depositId =
      String(meta.noah_fiat_deposit_id ?? meta.noah_rule_execution_id ?? enrichment?.ruleExecutionId ?? "")

    let processingAt = meta.processing_at != null ? String(meta.processing_at) : null
    let completedAt = meta.completed_at != null ? String(meta.completed_at) : null

    if (depositId) {
      const webhookMap = await fetchFiatDepositWebhooksByDepositIds(admin, [depositId])
      const ts = webhookMap.get(depositId)
      if (ts?.processingAt) processingAt = ts.processingAt
      if (ts?.completedAt && !completedAt) completedAt = ts.completedAt
    }

    if (!processingAt) {
      processingAt = String(row.occurred_at ?? row.created_at ?? "")
    }
    if (!completedAt && String(row.status) === "settled") {
      completedAt = String(row.settled_at ?? row.occurred_at ?? "")
    }

    const merged = mergePayInMetadataWithLifecycle(meta, { flow: "bank_onramp" }, {
      processing_at: processingAt,
      completed_at: completedAt,
      noah_fiat_deposit_id: depositId || null,
    })

    if (dryRun) {
      console.log("would patch", row.id, merged.processing_at, merged.completed_at)
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
