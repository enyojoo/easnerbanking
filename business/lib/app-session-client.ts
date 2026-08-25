"use client"

import { BUSINESS_APP_SESSION_COOKIE } from "@/lib/app-session-constants"
import { clearLegacySupabaseAuthCookiesOnce } from "@/lib/supabase/clear-legacy-auth-cookies"
import { createSupabaseBrowser } from "@/lib/supabase/browser"

let appSessionExpiresAt = 0
let appSessionPromise: Promise<boolean> | null = null

function setBusinessAppSessionCookie(token: string, expiresInSeconds: number) {
  const secure = typeof window !== "undefined" && window.location.protocol === "https:" ? "; Secure" : ""
  document.cookie = `${BUSINESS_APP_SESSION_COOKIE}=${token}; Max-Age=${expiresInSeconds}; Path=/; SameSite=Lax${secure}`
  appSessionExpiresAt = Date.now() + expiresInSeconds * 1000
}

export function clearBusinessAppSessionCookie(): void {
  if (typeof document === "undefined") return
  document.cookie = `${BUSINESS_APP_SESSION_COOKIE}=; Max-Age=0; Path=/; SameSite=Lax`
  appSessionExpiresAt = 0
}

function hasUsableBusinessAppSessionCookie(): boolean {
  if (typeof document === "undefined") return false
  if (appSessionExpiresAt > Date.now() + 15_000) return true
  return document.cookie.split(";").some((part) => part.trim().startsWith(`${BUSINESS_APP_SESSION_COOKIE}=`))
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
        clearBusinessAppSessionCookie()
        return false
      }

      const res = await fetch("/api/auth/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accessToken }),
        credentials: "omit",
      })

      if (!res.ok) {
        clearBusinessAppSessionCookie()
        return hasUsableBusinessAppSessionCookie()
      }

      const json = (await res.json()) as { token?: string; expiresIn?: number }
      if (!json.token || !json.expiresIn) {
        clearBusinessAppSessionCookie()
        return hasUsableBusinessAppSessionCookie()
      }

      setBusinessAppSessionCookie(json.token, json.expiresIn)
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
