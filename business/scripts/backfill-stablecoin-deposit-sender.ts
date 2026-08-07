/**
 * Backfill truncated Sender display for historical stablecoin deposits missing
 * `counterparty_address` (Turnkey inbound webhooks omit sender; resolved via Solana RPC).
 *
 * Usage:
 *   cd business && node --env-file=.env.local --import tsx scripts/backfill-stablecoin-deposit-sender.ts --dry-run
 *   cd business && node --env-file=.env.local --import tsx scripts/backfill-stablecoin-deposit-sender.ts
 *   cd business && node --env-file=.env.local --import tsx scripts/backfill-stablecoin-deposit-sender.ts --limit=50
 */
import { createSupabaseAdmin } from "../lib/supabase/admin"
import { backfillStablecoinDepositSenders } from "../lib/transactions/backfill-stablecoin-deposit-sender"

const dryRun = process.argv.includes("--dry-run")
const limitArg = process.argv.find((arg) => arg.startsWith("--limit="))
const limit = limitArg ? Number(limitArg.split("=")[1]) : 200

async function main() {
  const admin = createSupabaseAdmin()
  const result = await backfillStablecoinDepositSenders(admin, {
    limit: Number.isFinite(limit) ? limit : 200,
    dryRun,
    throttleMs: dryRun ? 0 : 180,
  })

  console.log("[backfill-stablecoin-deposit-sender]", {
    dryRun,
    ...result,
    failureSample: result.failures.slice(0, 10),
  })
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
