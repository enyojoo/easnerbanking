/**
 * Sync YC rates to Supabase and print key corridor rows.
 *
 * Usage: cd business && node --env-file=.env.local --import tsx scripts/sync-yc-rates-and-print.ts
 */
import { syncYcRatesSafe } from "../lib/fx/yc-rate-sync"
import { createSupabaseAdmin } from "../lib/supabase/admin"
import { listYcRates } from "../lib/fx/yc-rates"
import { listYellowcardRates, normalizeYcRateRow } from "../lib/yellowcard/rates"

async function main() {
  const live = (await listYellowcardRates())
    .map(normalizeYcRateRow)
    .filter(Boolean)
    .filter((r) => r!.currency === "NGN" || r!.currency === "KES")
  console.log("Live YC /rates API (sample):")
  for (const r of live) {
    console.log(`  ${r!.currency}: yc_buy=${r!.buy} yc_sell=${r!.sell}`)
  }
  console.log("")

  const sync = await syncYcRatesSafe()
  if (!sync.ok) {
    console.error("Sync failed:", sync.reason)
    process.exit(1)
  }
  console.log("Rate sync OK:", {
    updated: sync.result.updated,
    skipped: sync.result.skipped,
    pruned: sync.result.pruned,
  })

  const admin = createSupabaseAdmin()
  const rates = await listYcRates(admin, { status: "active" })

  function printRow(label: string, from: string, to: string) {
    const row = rates.find((r) => r.from_currency === from && r.to_currency === to)
    if (!row) {
      console.log(`${label}: (missing)`)
      return
    }
    console.log(`${label}:`)
    console.log(`  rate (customer): ${row.rate}`)
    console.log(`  yc_buy=${row.yc_buy} yc_sell=${row.yc_sell}`)
    console.log(`  easner_buy=${row.easner_buy} easner_sell=${row.easner_sell}`)
    if (row.yc_cross_mid != null) console.log(`  yc_cross_mid=${row.yc_cross_mid}`)
    console.log(`  as_of=${row.as_of}`)
  }

  console.log("")
  printRow("NGN pay-in (NGN→USDC)", "NGN", "USDC")
  console.log("")
  printRow("NGN payout (USD→NGN)", "USD", "NGN")
  console.log("")
  printRow("Cross NGN→KES", "NGN", "KES")
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
