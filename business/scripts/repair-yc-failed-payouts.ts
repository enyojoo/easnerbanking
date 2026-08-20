/**
 * Repair YC (and Noah) global payouts that failed after wallet debit without reversal.
 *
 * Usage:
 *   cd business && node --env-file=.env.local --import tsx scripts/repair-yc-failed-payouts.ts
 *   cd business && node --env-file=.env.local --import tsx scripts/repair-yc-failed-payouts.ts --dry-run
 */
import { createClient } from "@supabase/supabase-js"
import {
  listGlobalPayoutsFailedWithoutReversal,
  reverseGlobalPayoutWalletDebitForEasnerPayoutId,
} from "../lib/noah/global-payout-ledger"

async function main() {
  const dryRun = process.argv.includes("--dry-run")
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error("supabase_not_configured")

  const admin = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const rows = await listGlobalPayoutsFailedWithoutReversal(admin, { limit: 200 })
  console.log(`found ${rows.length} failed payouts without reversal`)

  let reversed = 0
  for (const row of rows) {
    if (!row.easnerPayoutId) {
      console.warn("skip – missing easner_payout_id", row.transactionId)
      continue
    }
    console.log({
      transactionId: row.transactionId,
      easnerPayoutId: row.easnerPayoutId,
      userId: row.userId,
      businessId: row.businessId,
    })
    if (dryRun) continue
    const ok = await reverseGlobalPayoutWalletDebitForEasnerPayoutId(admin, {
      easnerPayoutId: row.easnerPayoutId,
    })
    if (ok) reversed += 1
  }

  console.log(dryRun ? { dryRun: true, candidates: rows.length } : { reversed, total: rows.length })
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
