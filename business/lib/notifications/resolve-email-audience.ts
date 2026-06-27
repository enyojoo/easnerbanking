import type { SupabaseClient } from "@supabase/supabase-js"
import type { EmailAudience } from "@easner/server/lib/email-audience"

/**
 * Resolve business vs personal email audience from Supabase.
 */
export async function resolveEmailAudience(
  admin: SupabaseClient,
  userId: string,
): Promise<EmailAudience> {
  const { data: membership } = await admin
    .from("business_memberships")
    .select("business_id, role")
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle()

  if (membership?.business_id) return "business"

  const { data: userRow } = await admin
    .from("users")
    .select("easner_business_id, role")
    .eq("id", userId)
    .maybeSingle()

  if (userRow?.easner_business_id || userRow?.role === "business") return "business"

  return "personal"
}
