/**
 * Log Easner payout_corridors vs Noah sell channel availability (no DB writes by default).
 * Usage: cd business && npx tsx scripts/sync-payout-corridors-noah.ts
 */
import { config } from "dotenv"
config({ path: ".env.local" })

import { createSupabaseAdmin } from "../lib/supabase/admin"
import { hasNoahSellChannel } from "../lib/noah/channel-availability"

async function main() {
  const admin = createSupabaseAdmin()
  const { data, error } = await admin
    .from("payout_corridors")
    .select("id,country_code,currency_code,rail,enabled")
    .order("country_code")

  if (error) throw error

  console.log("id | cc | fiat | rail | db_enabled | noah_sell")
  for (const row of data ?? []) {
    const cc = String(row.country_code).toUpperCase()
    const fiat = String(row.currency_code).toUpperCase()
    const ok = await hasNoahSellChannel({ country: cc, fiatCurrency: fiat })
    console.log(
      `${row.id?.slice(0, 8)} | ${cc} | ${fiat} | ${row.rail} | ${row.enabled} | ${ok}`,
    )
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
