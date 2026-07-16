import type { SupabaseClient } from "@supabase/supabase-js"

/** Marks abandoned MoMo draft sessions as expired (ops-safe minimal v1 hook). */
export async function expireStalePendingAuthorizeTransfers(
  admin: SupabaseClient,
  opts?: { userId?: string; limit?: number },
): Promise<number> {
  const now = new Date().toISOString()
  let query = admin
    .from("yc_transfers")
    .select("id")
    .eq("status", "pending_authorize")
    .lt("expires_at", now)
    .limit(opts?.limit ?? 50)

  if (opts?.userId) {
    query = query.eq("user_id", opts.userId)
  }

  const { data: rows } = await query
  if (!rows?.length) return 0

  const ids = rows.map((r) => String(r.id))
  const { error } = await admin
    .from("yc_transfers")
    .update({ status: "expired", updated_at: now })
    .in("id", ids)

  if (error) return 0
  return ids.length
}
