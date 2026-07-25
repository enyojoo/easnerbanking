/**
 * Provision payout_corridors from all live provider capabilities and refresh all field schemas.
 *
 * Usage: cd business && node --env-file=.env.local --import tsx scripts/sync-all-provider-corridors.ts
 */
import { createClient } from "@supabase/supabase-js"
import { syncAllCorridorSchemasSafe } from "../lib/fx/grid-schema-sync"

async function main() {
  const supabaseUrl = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim()
  const serviceRoleKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim()
  if (!supabaseUrl || !serviceRoleKey) throw new Error("supabase_not_configured")

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const result = await syncAllCorridorSchemasSafe(admin)
  if (!result.ok) {
    console.error("corridor_sync_failed", result.error)
    process.exit(1)
  }
  console.log("corridor_sync", JSON.stringify(result, null, 2))
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
