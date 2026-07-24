/**
 * Sync Grid corridor field schemas into payout_corridors.fields_schema.grid.
 * Preserves existing fields_schema.noah and fields_schema.yellowcard.
 *
 * Usage: cd business && node --env-file=.env.local --import tsx scripts/sync-grid-corridor-schemas.ts
 */
import { createClient } from "@supabase/supabase-js"
import { syncGridCorridorSchemas } from "../lib/fx/grid-schema-sync"

async function main() {
  const supabaseUrl = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim()
  const serviceRoleKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim()
  if (!supabaseUrl || !serviceRoleKey) throw new Error("supabase_not_configured")

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const result = await syncGridCorridorSchemas(admin, { forceRefresh: true })
  if (!result.ok) {
    console.error("grid_schema_sync_failed", result.error)
    process.exit(1)
  }
  console.log(`grid_schema_sync done updated=${result.updated} skipped=${result.skipped}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
