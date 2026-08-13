/**
 * One-time: clear grid/yc/noah live flags on disabled payout_corridors rows.
 * Usage: cd business && node --env-file=.env.local --import tsx scripts/cleanup-stale-corridor-live-flags.ts
 */
import { createClient } from "@supabase/supabase-js"
import { syncCorridorLiveFlagsWithEnabled } from "../lib/fx/orphan-payout-corridor-cleanup"

async function main() {
  const supabaseUrl = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim()
  const serviceRoleKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim()
  if (!supabaseUrl || !serviceRoleKey) throw new Error("supabase_not_configured")

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const result = await syncCorridorLiveFlagsWithEnabled(admin)
  console.log(JSON.stringify(result, null, 2))
  if (!result.ok) process.exit(1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
