import type { SupabaseClient } from "@supabase/supabase-js"
import { normalizeEasetag } from "@/lib/easetag-validation"

type Admin = SupabaseClient

export type EasetagAvailabilityOptions = {
  excludeUserId?: string
  excludeBusinessId?: string
  excludePlatformCustomerId?: string
}

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
  options?: EasetagAvailabilityOptions,
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
  if (brows && brows.length > 0) return false

  let pq = admin.from("platform_customers").select("id").eq("easetag", clean).limit(1)
  if (options?.excludePlatformCustomerId) pq = pq.neq("id", options.excludePlatformCustomerId)
  const { data: prows, error: perr } = await pq
  if (perr) {
    if (isUndefinedEasetagColumnError(perr)) return true
    throw new Error(perr.message)
  }
  return !(prows && prows.length > 0)
}
