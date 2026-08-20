import type { SupabaseClient } from "@supabase/supabase-js"

/** First token of `users.full_name` – `public.users` has no `first_name` column. */
export function firstNameFromFullName(fullName: string | null | undefined): string | undefined {
  const trimmed = String(fullName ?? "").trim()
  if (!trimmed) return undefined
  return trimmed.split(/\s+/)[0] || undefined
}

export type UserEmailContact = {
  email: string | null
  firstName?: string
}

/**
 * Load email + greeting name for notification sends.
 * Must not select `first_name` – that column does not exist on `public.users`, and a failed
 * select returns null `data`, which silently skips transaction emails while push still fires.
 */
export async function fetchUserEmailContact(
  admin: SupabaseClient,
  userId: string,
): Promise<UserEmailContact> {
  const { data, error } = await admin
    .from("users")
    .select("email, full_name")
    .eq("id", userId)
    .maybeSingle()

  if (error) {
    console.warn("fetchUserEmailContact:", error.message)
    return { email: null }
  }

  return {
    email: data?.email?.trim() || null,
    firstName: firstNameFromFullName(
      (data as { full_name?: string | null } | null)?.full_name,
    ),
  }
}
