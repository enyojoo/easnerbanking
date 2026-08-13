/**
 * Provision payout_corridors from Grid discoveries + exchange rates, then sync field schemas.
 *
 * Usage: cd business && node --env-file=.env.local --import tsx scripts/sync-grid-corridors.ts
 */
import { createClient } from "@supabase/supabase-js"
import { syncGridPayoutCorridors } from "../lib/fx/grid-corridor-sync"
import { syncGridCorridorSchemas } from "../lib/fx/grid-schema-sync"

async function main() {
  const supabaseUrl = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim()
  const serviceRoleKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim()
  if (!supabaseUrl || !serviceRoleKey) throw new Error("supabase_not_configured")

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const provision = await syncGridPayoutCorridors(admin, { forceRefresh: true })
  if (!provision.ok) {
    console.error("grid_corridor_sync_failed", provision.error)
    process.exit(1)
  }
  console.log(
    `grid_corridor_sync done targets=${provision.targets} inserted=${provision.inserted} updated=${provision.updated} skipped=${provision.skipped} orphans_disabled=${provision.pruned}`,
  )

  const schemas = await syncGridCorridorSchemas(admin, { forceRefresh: false })
  if (!schemas.ok) {
    console.error("grid_schema_sync_failed", schemas.error)
    process.exit(1)
  }
  console.log(`grid_schema_sync done updated=${schemas.updated} skipped=${schemas.skipped}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
