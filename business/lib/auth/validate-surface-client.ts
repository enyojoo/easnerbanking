"use client"

import { apiUrl } from "@/lib/api-base-url"
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
  let res: Response
  try {
    // Omit cookies; put the JWT in the body so `Authorization` does not inflate headers (494 on Vercel).
    res = await fetch(apiUrl("/api/auth/validate-app-surface"), {
      method: "POST",
      credentials: "omit",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        surface: "business_web",
        accessToken: session.access_token,
      }),
    })
  } catch {
    // Offline / transient network: do not block sign-in.
    return
  }
  const body = (await res.json().catch(() => ({}))) as { error?: string; code?: string }
  if (!res.ok) {
    if (body.code === "PLATFORM_MAINTENANCE") return
    await supabase.auth.signOut({ scope: "local" })
    clearBusinessAppSessionCookie()
    throw new Error(
      typeof body.error === "string" ? body.error : "This account cannot access Easner Business.",
    )
  }
}
