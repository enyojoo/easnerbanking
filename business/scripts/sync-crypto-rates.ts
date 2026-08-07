/**
 * Sync crypto_rates from Relay probe quotes + Easner wallet-send margin.
 *
 * Usage:
 *   cd business && node --env-file=.env.local --import tsx scripts/sync-crypto-rates.ts
 *   cd business && node --env-file=.env.local --import tsx scripts/sync-crypto-rates.ts --dry-run
 */
import { syncCryptoExchangeRates } from "../lib/fx/crypto-rate-sync"

const dryRun = process.argv.includes("--dry-run")

async function main() {
  const result = await syncCryptoExchangeRates({ dryRun })
  console.log(
    JSON.stringify(
      {
        dryRun,
        updated: result.updated,
        skipped: result.skipped,
        skippedPairs: result.skippedPairs.slice(0, 20),
      },
      null,
      2,
    ),
  )
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
