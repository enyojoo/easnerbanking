/**
 * Sync Grid exchange rates into grid_rates table.
 *
 * Usage: cd business && node --env-file=.env.local --import tsx scripts/sync-grid-rates.ts
 */
import { syncGridExchangeRates } from "../lib/fx/grid-rate-sync"

async function main() {
  const result = await syncGridExchangeRates()
  if (!result.ok) {
    console.error("grid_rate_sync_failed", result.error)
    process.exit(1)
  }
  console.log(`grid_rate_sync done upserted=${result.upserted} skipped=${result.skipped}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
