"use client"

import { useEffect, useState, type ReactNode } from "react"
import { Loader2 } from "lucide-react"
import { usePathname, useRouter } from "next/navigation"
import { useAuth } from "@/lib/auth-context"
import { isMfaStepRequired } from "@/lib/auth-mfa"
import { createSupabaseBrowser } from "@/lib/supabase/browser"

/** Routes that must run while a session may exist (recovery, OAuth exchange, Noah returns). */
function skipAuthenticatedRedirect(pathname: string): boolean {
  return (
    pathname.startsWith("/auth/callback") ||
    pathname.startsWith("/auth/reset-password") ||
    pathname.startsWith("/auth/noah-")
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
      router.replace("/dashboard")
      return
    }

    let cancelled = false
    ;(async () => {
      const supabase = createSupabaseBrowser()
      const { data: aal, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
      if (cancelled) return
      if (error) {
        setLoginSessionChecked(true)
        return
      }
      if (isMfaStepRequired(aal)) {
        setLoginSessionChecked(true)
        return
      }
      router.replace("/dashboard")
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
    return (
      <div
        className="fixed inset-0 z-[200] flex items-center justify-center bg-background"
        role="status"
        aria-busy="true"
        aria-label="Loading"
      >
        <Loader2 className="h-10 w-10 animate-spin text-muted-foreground" aria-hidden />
      </div>
    )
  }

  return <>{children}</>
}
