import type { SupabaseClient } from "@supabase/supabase-js"
import { DEFAULT_COMMUNICATION_PREFERENCES } from "@easner/shared"

/** Persist opt-out-capable defaults when the user has no preferences row yet. */
export async function ensureDefaultCommunicationPreferences(
  admin: SupabaseClient,
  userId: string,
): Promise<void> {
  const { data, error } = await admin
    .from("user_preferences")
    .select("user_id")
    .eq("user_id", userId)
    .maybeSingle()

  if (error && error.code !== "42P01" && error.code !== "42703") {
    console.warn("ensureDefaultCommunicationPreferences read:", error.message)
    return
  }
  if (data?.user_id) return

  const nowIso = new Date().toISOString()
  const upsert = await admin.from("user_preferences").upsert(
    {
      user_id: userId,
      communication_preferences: DEFAULT_COMMUNICATION_PREFERENCES,
      updated_at: nowIso,
    },
    { onConflict: "user_id" },
  )

  if (upsert.error && upsert.error.code !== "42P01") {
    console.warn("ensureDefaultCommunicationPreferences upsert:", upsert.error.message)
  }
}
