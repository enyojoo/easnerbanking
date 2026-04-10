"use client"

import { clearBusinessAppSessionCookie } from "@/lib/app-session-client"
import type { createSupabaseBrowser } from "@/lib/supabase/browser"

type SupabaseBrowser = ReturnType<typeof createSupabaseBrowser>

/** Call after Supabase sign-in / MFA / OAuth on the Business web app. */
export async function ensureBusinessWebSurface(supabase: SupabaseBrowser): Promise<void> {
  const {
    data: { session },
  } = await supabase.auth.getSession()
  if (!session?.access_token) {
    throw new Error("No session")
  }
  const origin = typeof window !== "undefined" ? window.location.origin : ""
  let res: Response
  try {
    // Omit cookies: Bearer is enough; Cookie + Authorization can exceed platform header limits (494).
    res = await fetch(`${origin}/api/auth/validate-app-surface`, {
      method: "POST",
      credentials: "omit",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ surface: "business_web" }),
    })
  } catch {
    // Offline / transient network: do not block sign-in.
    return
  }
  const body = (await res.json().catch(() => ({}))) as { error?: string }
  if (!res.ok) {
    await supabase.auth.signOut()
    clearBusinessAppSessionCookie()
    throw new Error(
      typeof body.error === "string" ? body.error : "This account cannot access Easner Business.",
    )
  }
}
