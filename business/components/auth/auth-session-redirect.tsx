"use client"

import { useEffect, useState, type ReactNode } from "react"
import { usePathname, useRouter } from "next/navigation"
import { getWorkspaceHomePath } from "@/lib/app-surface"
import { useAuth } from "@/lib/auth-context"
import { resolvePostSignInMfaRequirement } from "@/lib/auth-mfa"
import { createSupabaseBrowser } from "@/lib/supabase/browser"

/** Routes that must run while a session may exist (recovery, OAuth exchange, hosted KYC returns). */
function skipAuthenticatedRedirect(pathname: string): boolean {
  return (
    pathname.startsWith("/auth/callback") ||
    pathname.startsWith("/auth/reset-password") ||
    pathname.startsWith("/auth/onboarding-complete") ||
    pathname.startsWith("/auth/noah-") ||
    pathname.startsWith("/auth/grid-") ||
    pathname.startsWith("/auth/bridge-")
  )
}

/** Logged-in users should leave these and go to the app (login also waits on MFA below). */
function isAuthEntryRedirectRoute(pathname: string): boolean {
  return (
    pathname === "/auth/login" ||
    pathname === "/auth/signup" ||
    pathname === "/auth/forgot-password"
  )
}

export function AuthSessionRedirect({ children }: { children: ReactNode }) {
  const pathname = usePathname() || ""
  const router = useRouter()
  const { user, isLoading } = useAuth()
  const isLogin = pathname === "/auth/login"
  const shouldRedirectWhenAuthed =
    !skipAuthenticatedRedirect(pathname) && isAuthEntryRedirectRoute(pathname)

  const [loginSessionChecked, setLoginSessionChecked] = useState(!isLogin)

  useEffect(() => {
    setLoginSessionChecked(!isLogin)
  }, [isLogin])

  useEffect(() => {
    if (!shouldRedirectWhenAuthed || isLoading || !user) return

    if (!isLogin) {
      router.replace(getWorkspaceHomePath())
      return
    }

    let cancelled = false
    ;(async () => {
      const supabase = createSupabaseBrowser()
      const { needsOtp, error } = await resolvePostSignInMfaRequirement(supabase)
      if (cancelled) return
      if (error) {
        setLoginSessionChecked(true)
        return
      }
      if (needsOtp) {
        setLoginSessionChecked(true)
        return
      }
      router.replace(getWorkspaceHomePath())
    })()

    return () => {
      cancelled = true
    }
  }, [isLogin, isLoading, router, shouldRedirectWhenAuthed, user])

  const showRedirecting =
    shouldRedirectWhenAuthed &&
    !isLoading &&
    user &&
    (!isLogin || !loginSessionChecked)

  if (showRedirecting) {
    // Intentionally render nothing during the short auth → workspace redirect
    // instead of an intermediary spinner. Workspace routes render the shell
    // immediately and resolve auth in the background.
    return null
  }

  return <>{children}</>
}
