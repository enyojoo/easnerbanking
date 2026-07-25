import type { SupabaseClient } from "@supabase/supabase-js"
import { annotateAdminCorridorsWithProviderHealth } from "@/lib/admin/annotate-payout-corridors"
import { isZombiePayoutCorridor, zombieCorridorKey } from "@/lib/admin/corridor-rail-capability"

export type PruneZombieCorridorsResult = {
  ok: boolean
  pruned: number
  candidates: string[]
  error?: string
}

/** Delete empty corridor shells and product-excluded targets (e.g. NG MoMo). */
export async function pruneZombiePayoutCorridors(
  admin: SupabaseClient,
): Promise<PruneZombieCorridorsResult> {
  const { data: rows, error } = await admin.from("payout_corridors").select("*")
  if (error) {
    return { ok: false, pruned: 0, candidates: [], error: error.message }
  }

  const annotated = await annotateAdminCorridorsWithProviderHealth(rows ?? [])
  const toDelete = annotated.filter((row) => isZombiePayoutCorridor(row))
  const candidates = toDelete.map((row) => zombieCorridorKey(row))

  if (toDelete.length === 0) {
    return { ok: true, pruned: 0, candidates: [] }
  }

  const ids = toDelete.map((row) => row.id)
  const { error: delErr } = await admin.from("payout_corridors").delete().in("id", ids)
  if (delErr) {
    return { ok: false, pruned: 0, candidates, error: delErr.message }
  }

  return { ok: true, pruned: toDelete.length, candidates }
}
