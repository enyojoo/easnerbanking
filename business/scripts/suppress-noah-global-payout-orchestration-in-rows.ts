/**
 * Delete legacy Noah Solana USDC IN rows for global payout (orchestration legs belong on OUT only).
 *
 * Usage:
 *   cd business && node --env-file=.env.local --import tsx scripts/suppress-noah-global-payout-orchestration-in-rows.ts --dry-run
 *   cd business && node --env-file=.env.local --import tsx scripts/suppress-noah-global-payout-orchestration-in-rows.ts
 */
import {
  deleteNoahGlobalPayoutOrchestrationInLedgerRowIfPresent,
  isNoahGlobalPayoutOrchestrationInLegShape,
} from "../lib/noah/global-payout-ledger"
import { createSupabaseAdmin } from "../lib/supabase/admin"

const dryRun = process.argv.includes("--dry-run")

async function main() {
  const admin = createSupabaseAdmin()
  const { data: rows, error } = await admin
    .from("transactions")
    .select("id, user_id, business_id, provider_transaction_id, metadata, payload, direction")
    .eq("provider", "noah")
    .eq("direction", "in")

  if (error) {
    console.error(error.message)
    process.exit(1)
  }

  let deleted = 0
  for (const row of rows ?? []) {
    const payload = row.payload as Record<string, unknown> | undefined
    if (!payload || !isNoahGlobalPayoutOrchestrationInLegShape(payload)) continue

    const userId = String(row.user_id ?? "")
    const businessId = row.business_id != null ? String(row.business_id) : null
    const providerTransactionId = String(row.provider_transaction_id ?? "").trim()

    if (dryRun) {
      console.log(`[dry-run] delete ${row.id} (${providerTransactionId})`)
      deleted++
      continue
    }

    const didDelete = await deleteNoahGlobalPayoutOrchestrationInLedgerRowIfPresent(admin, {
      noahTransactionId: providerTransactionId,
      userId,
      businessId,
    })
    if (didDelete) deleted++
  }

  console.log(dryRun ? `Dry run: would delete ${deleted} rows` : `Deleted ${deleted} rows`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
