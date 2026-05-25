/**
 * Sync noah_rates from Noah GET /prices (Rate field) + Easner margin.
 *
 * Usage:
 *   cd business && node --env-file=.env.local --import tsx scripts/sync-noah-rates.ts
 *   cd business && node --env-file=.env.local --import tsx scripts/sync-noah-rates.ts --dry-run
 *   cd business && node --env-file=.env.local --import tsx scripts/sync-noah-rates.ts --seed
 */
import { syncNoahExchangeRates } from "../lib/fx/noah-rate-sync"

const dryRun = process.argv.includes("--dry-run")
const seedMissing = process.argv.includes("--seed")

async function main() {
  const result = await syncNoahExchangeRates({ dryRun, seedMissing })
  console.log(
    JSON.stringify(
      {
        dryRun,
        updated: result.updated,
        skipped: result.skipped,
        pairs: result.pairs.slice(0, 40),
        skippedPairs: result.skippedPairs.slice(0, 20),
      },
      null,
      2,
    ),
  )
  const ngn = result.pairs.find((p) => p.from_currency === "USD" && p.to_currency === "NGN")
  if (ngn) {
    console.log(`USD→NGN: noah_mid=${ngn.noah_mid}, rate=${ngn.rate}`)
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
