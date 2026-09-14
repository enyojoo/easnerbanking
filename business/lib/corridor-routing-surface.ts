import type { SupabaseClient } from "@supabase/supabase-js"
import { routingSurfaceFromUserRole, type CorridorRoutingSurface } from "@easner/shared"

export async function loadUserRoutingSurface(
  admin: SupabaseClient,
  userId: string | null | undefined,
): Promise<CorridorRoutingSurface> {
  if (!userId) return "business"
  const { data } = await admin.from("users").select("role").eq("id", userId).maybeSingle()
  return routingSurfaceFromUserRole(
    data && typeof data === "object" ? String((data as { role?: string }).role ?? "") : null,
  )
}
