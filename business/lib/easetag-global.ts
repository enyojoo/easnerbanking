import type { SupabaseClient } from "@supabase/supabase-js"
import { normalizeEasetag } from "@/lib/easetag-validation"

type Admin = SupabaseClient

/** True if no other user or business owns this Easetag. */
export async function isEasetagGloballyAvailable(
  admin: Admin,
  easetag: string,
  options?: { excludeUserId?: string; excludeBusinessId?: string },
): Promise<boolean> {
  const clean = normalizeEasetag(easetag)
  let uq = admin.from("users").select("id").eq("easetag", clean).limit(1)
  if (options?.excludeUserId) uq = uq.neq("id", options.excludeUserId)
  const { data: urows, error: uerr } = await uq
  if (uerr) throw new Error(uerr.message)
  if (urows && urows.length > 0) return false

  let bq = admin.from("businesses").select("id").eq("easetag", clean).limit(1)
  if (options?.excludeBusinessId) bq = bq.neq("id", options.excludeBusinessId)
  const { data: brows, error: berr } = await bq
  if (berr) {
    if (berr.code === "42703" || String(berr.message).includes("easetag")) {
      return true
    }
    throw new Error(berr.message)
  }
  return !(brows && brows.length > 0)
}
