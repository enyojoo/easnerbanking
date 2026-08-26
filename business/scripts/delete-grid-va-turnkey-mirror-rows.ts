/**
 * Delete hidden Grid VA → Turnkey mirror ledger rows.
 * Does not reverse wallet balance (suppression already did that).
 *
 * Usage:
 *   cd business
 *   BUSINESS_ID=53798479-3d39-428a-bd22-0b48fc3792a2 node --env-file=.env.local --import ./scripts/stub-server-only.mjs --import tsx scripts/delete-grid-va-turnkey-mirror-rows.ts --dry-run
 *   BUSINESS_ID=53798479-3d39-428a-bd22-0b48fc3792a2 node --env-file=.env.local --import ./scripts/stub-server-only.mjs --import tsx scripts/delete-grid-va-turnkey-mirror-rows.ts
 */
import { createClient } from "@supabase/supabase-js"

const dryRun = process.argv.includes("--dry-run")

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error("supabase env missing")
  const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })

  const businessId = process.env.BUSINESS_ID?.trim() || null
  let q = admin
    .from("transactions")
    .select(
      "id,easner_transaction_id,amount,currency,provider,direction,tx_hash,hidden_from_feed,metadata,created_at",
    )
    .eq("provider", "turnkey")
    .eq("direction", "in")
    .contains("metadata", { grid_va_turnkey_chain_mirror: true })
  if (businessId) q = q.eq("business_id", businessId)

  const { data: rows, error } = await q.order("created_at", { ascending: true })
  if (error) throw error

  const deleteIds = (rows ?? []).map((row) => String(row.id))
  console.log(
    JSON.stringify(
      {
        dryRun,
        count: deleteIds.length,
        rows: (rows ?? []).map((row) => {
          const meta = (row.metadata as Record<string, unknown> | undefined) ?? {}
          return {
            id: row.id,
            easner_transaction_id: row.easner_transaction_id,
            amount: row.amount,
            reporting_wallet_amount: meta.reporting_wallet_amount ?? null,
            tx_hash: row.tx_hash,
            hidden_from_feed: row.hidden_from_feed,
            balance_delta_applied: meta.balance_delta_applied ?? null,
          }
        }),
      },
      null,
      2,
    ),
  )

  if (!dryRun && deleteIds.length) {
    const { error: delError } = await admin.from("transactions").delete().in("id", deleteIds)
    if (delError) throw delError
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
