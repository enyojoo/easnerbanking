import type { SupabaseClient } from "@supabase/supabase-js"
import { normalizeEasetag } from "@/lib/easetag-validation"

type Admin = SupabaseClient

export function isUndefinedEasetagColumnError(err: { code?: string; message?: string } | null): boolean {
  if (!err) return false
  const code = String(err.code ?? "")
  if (code === "42703") return true
  const msg = String(err.message ?? "")
  return /\beasetag\b/i.test(msg) && /does not exist/i.test(msg)
}

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
  if (uerr) {
    if (!isUndefinedEasetagColumnError(uerr)) throw new Error(uerr.message)
  } else if (urows && urows.length > 0) {
    return false
  }

  let bq = admin.from("businesses").select("id").eq("easetag", clean).limit(1)
  if (options?.excludeBusinessId) bq = bq.neq("id", options.excludeBusinessId)
  const { data: brows, error: berr } = await bq
  if (berr) {
    if (isUndefinedEasetagColumnError(berr)) return true
    throw new Error(berr.message)
  }
  return !(brows && brows.length > 0)
}
