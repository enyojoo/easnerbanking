"use client"

/**
 * Removes `sb-*` cookies left by earlier `@supabase/ssr` `createBrowserClient` deploys.
 * Those cookies can push the `Cookie` header over Vercel’s limit; localStorage auth
 * does not need them. Safe to run once per page load.
 */
let didRun = false

export function clearLegacySupabaseAuthCookiesOnce(): void {
  if (didRun || typeof document === "undefined") return
  didRun = true

  const names = document.cookie.split(";").map((c) => c.trim().split("=")[0]?.trim()).filter(Boolean)
  for (const name of names) {
    if (!name.startsWith("sb-")) continue
    document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/`
    document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/;domain=${location.hostname}`
  }
}
