import { createServerClient } from "./supabase"

export function normalizeSuppressedEmail(email: string): string {
  return email.trim().toLowerCase()
}

export async function isEmailSuppressed(email: string): Promise<boolean> {
  const normalized = normalizeSuppressedEmail(email)
  if (!normalized) return false
  try {
    const admin = createServerClient()
    const { data, error } = await admin
      .from("email_suppressions")
      .select("email")
      .eq("email", normalized)
      .maybeSingle()
    if (error) {
      console.warn("[email] suppression lookup failed:", error.message)
      return false
    }
    return Boolean(data?.email)
  } catch (error) {
    console.warn(
      "[email] suppression lookup skipped:",
      error instanceof Error ? error.message : "unknown",
    )
    return false
  }
}
