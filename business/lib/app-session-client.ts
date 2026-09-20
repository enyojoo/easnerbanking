"use client"

import { clearLegacySupabaseAuthCookiesOnce } from "@/lib/supabase/clear-legacy-auth-cookies"
import { createSupabaseBrowser } from "@/lib/supabase/browser"

let appSessionExpiresAt = 0
let appSessionPromise: Promise<boolean> | null = null

/**
 * The session cookie is httpOnly (set by `/api/auth/session` on the server) —
 * JS can no longer read or write it directly. `appSessionExpiresAt` is our
 * only signal for "do we still have one," and resets on reload, which is
 * the accepted tradeoff for keeping the token out of `document.cookie`.
 */
export function clearBusinessAppSessionCookie(): void {
  resetAppSessionMarker()
  if (typeof fetch !== "function") return
  fetch("/api/auth/session", { method: "DELETE", credentials: "same-origin" }).catch(() => {})
}

/** Local-only reset for "we never had a cookie to begin with" paths — no network call. */
function resetAppSessionMarker(): void {
  appSessionExpiresAt = 0
}

function hasUsableBusinessAppSessionCookie(): boolean {
  return appSessionExpiresAt > Date.now() + 15_000
}

export async function ensureBusinessAppSession(force = false): Promise<boolean> {
  clearLegacySupabaseAuthCookiesOnce()

  if (!force && hasUsableBusinessAppSessionCookie()) {
    return true
  }

  if (appSessionPromise) {
    return appSessionPromise
  }

  appSessionPromise = (async () => {
    try {
      const supabase = createSupabaseBrowser()
      const {
        data: { session },
      } = await supabase.auth.getSession()

      const accessToken = session?.access_token
      if (!accessToken) {
        resetAppSessionMarker()
        return false
      }

      const res = await fetch("/api/auth/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accessToken }),
        credentials: "same-origin",
      })

      if (!res.ok) {
        clearBusinessAppSessionCookie()
        return hasUsableBusinessAppSessionCookie()
      }

      const json = (await res.json()) as { ok?: boolean; expiresIn?: number }
      if (!json.ok || !json.expiresIn) {
        clearBusinessAppSessionCookie()
        return hasUsableBusinessAppSessionCookie()
      }

      appSessionExpiresAt = Date.now() + json.expiresIn * 1000
      return true
    } catch {
      // Session mint can fail on a tab wake / dev-server blip; keep using an
      // existing short-lived cookie instead of failing every `/api/*` call.
      return hasUsableBusinessAppSessionCookie()
    }
  })().finally(() => {
    appSessionPromise = null
  })

  return appSessionPromise
}
