/**
 * Sync YC corridor field schemas into payout_corridors.fields_schema.yellowcard.
 * Usage: cd business && node --env-file=.env.local --import tsx scripts/sync-yc-corridor-schemas.ts
 */
import { createSupabaseAdmin } from "../lib/supabase/admin"
import { syncYcCorridorSchemas } from "../lib/fx/yc-schema-sync"

async function main() {
  const admin = createSupabaseAdmin()
  const result = await syncYcCorridorSchemas(admin)
  if (!result.ok) {
    console.error("yc_schema_sync_failed", result.error)
    process.exit(1)
  }
  console.log(JSON.stringify({ ok: true, updated: result.updated, skipped: result.skipped }, null, 2))
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
