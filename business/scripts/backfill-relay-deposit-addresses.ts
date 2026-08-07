/**
 * Backfill Relay Tron USDT deposit addresses for existing USD (Solana USDC) vaults.
 *
 * Usage:
 *   cd business && node --env-file=.env.local --import tsx scripts/backfill-relay-deposit-addresses.ts --dry-run
 *   cd business && node --env-file=.env.local --import tsx scripts/backfill-relay-deposit-addresses.ts --process
 *   cd business && node --env-file=.env.local --import tsx scripts/backfill-relay-deposit-addresses.ts --process --limit=100
 */
import { createSupabaseAdmin } from "../lib/supabase/admin"
import { backfillRelayDepositAddresses } from "../lib/relay-deposit/backfill-relay-deposit-addresses"

const dryRun = process.argv.includes("--dry-run")
const processJobs = process.argv.includes("--process")
const limitArg = process.argv.find((arg) => arg.startsWith("--limit="))
const limit = limitArg ? Number(limitArg.split("=")[1]) : 500

async function main() {
  const admin = createSupabaseAdmin()
  const result = await backfillRelayDepositAddresses(admin, {
    dryRun,
    limit: Number.isFinite(limit) ? limit : 500,
    processJobs: processJobs && !dryRun,
    processBatchSize: 5,
    maxProcessRounds: 400,
  })

  console.log("[backfill-relay-deposit-addresses]", {
    dryRun,
    processJobs: processJobs && !dryRun,
    ...result,
    failureSample: result.failures.slice(0, 15),
  })
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
