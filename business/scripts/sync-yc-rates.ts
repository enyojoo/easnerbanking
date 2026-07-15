/**
 * Sync Yellowcard rates into yellowcard_rates.
 * Usage: cd business && node --env-file=.env.local --import tsx scripts/sync-yc-rates.ts
 */
import { syncYcExchangeRates } from "../lib/fx/yc-rate-sync"

async function main() {
  const dryRun = process.argv.includes("--dry-run")
  const result = await syncYcExchangeRates({ dryRun })
  console.log(JSON.stringify(result, null, 2))
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
