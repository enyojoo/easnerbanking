/**
 * Backfill Grid receive rails (USD VA + Turnkey external account) for approved businesses.
 *
 * Usage:
 *   cd business
 *   node --env-file=.env.local --import ./scripts/stub-server-only.mjs --import tsx scripts/backfill-grid-receive-rails.ts
 */
import { createClient } from "@supabase/supabase-js"
import { reconcilePendingGridBusinessReceiveRails } from "@/lib/grid/reconcile-pending-receive-rails"

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error("supabase env missing")
  const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })

  const result = await reconcilePendingGridBusinessReceiveRails(admin, { limit: 50 })
  console.log(JSON.stringify(result, null, 2))

  if (result.pending > 0 || result.rows.some((r) => r.error)) {
    process.exitCode = 1
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
