/**
 * Delete zombie payout corridors (empty shells + product exclusions).
 * Usage: cd business && node --env-file=.env.local --import tsx scripts/cleanup-zombie-payout-corridors.ts [--execute]
 */
import { createSupabaseAdmin } from "../lib/supabase/admin"
import { annotateAdminCorridorsWithProviderHealth } from "../lib/admin/annotate-payout-corridors"
import {
  corridorHasRailCapability,
  isZombiePayoutCorridor,
  zombieCorridorKey,
} from "../lib/admin/corridor-rail-capability"
import { pruneZombiePayoutCorridors } from "../lib/admin/prune-zombie-payout-corridors"

async function main() {
  const execute = process.argv.includes("--execute")
  const admin = createSupabaseAdmin()

  const { data: rows } = await admin.from("payout_corridors").select("*").order("country_name")
  const annotated = await annotateAdminCorridorsWithProviderHealth(rows ?? [])
  const candidates = annotated.filter((row) => isZombiePayoutCorridor(row))

  console.log(`Found ${candidates.length} corridor(s) to delete:`)
  for (const row of candidates) {
    console.log(
      `  ${zombieCorridorKey(row)} id=${row.id} enabled=${row.enabled}`,
    )
  }

  const visibleAfter = annotated.filter((row) => corridorHasRailCapability(row))
  const hiddenZombies = annotated.filter(
    (row) => !corridorHasRailCapability(row) && !isZombiePayoutCorridor(row),
  )
  console.log(`\nVisible on fiat admin after filter: ${visibleAfter.length}`)
  if (hiddenZombies.length) {
    console.log(`Non-zombie hidden rows (configured but no live flags): ${hiddenZombies.length}`)
  }

  if (!execute) {
    console.log("\nDry run – pass --execute to delete.")
    return
  }

  const result = await pruneZombiePayoutCorridors(admin)
  if (!result.ok) {
    console.error("Delete failed:", result.error)
    process.exit(1)
  }
  console.log(`\nDeleted ${result.pruned} corridor(s).`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
