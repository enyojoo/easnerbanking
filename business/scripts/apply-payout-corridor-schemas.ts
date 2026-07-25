/**
 * Sync Noah FormSchema hints into payout_corridors.fields_schema.noah.
 * Usage: cd business && node --env-file=.env.local --import tsx scripts/apply-payout-corridor-schemas.ts
 */
import { createSupabaseAdmin } from "../lib/supabase/admin"
import { syncNoahCorridorSchemas } from "../lib/fx/noah-schema-sync"

async function main() {
  const admin = createSupabaseAdmin()
  const result = await syncNoahCorridorSchemas(admin)
  if (!result.ok) {
    console.error("noah_schema_sync_failed", result.error)
    process.exit(1)
  }
  console.log(`noah_schema_sync done updated=${result.updated} skipped=${result.skipped}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
