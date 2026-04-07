"use client"

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react"
import type { User } from "@supabase/supabase-js"
import { clearBusinessAppSessionCookie } from "@/lib/app-session-client"
import { fetchWithSession } from "@/lib/fetch-with-session"
import { clearLegacySupabaseAuthCookiesOnce } from "@/lib/supabase/clear-legacy-auth-cookies"
import { createSupabaseBrowser } from "@/lib/supabase/browser"
import { getOnboarding } from "@/lib/onboarding-store"
import { removePin } from "@/lib/login-pin"
import { resetSessionActivity } from "@/lib/session-activity"
import { IdleSessionBridge } from "@/components/idle-session-bridge"
import { analytics } from "@/lib/analytics"

interface AuthContextType {
  user: User | null
  login: (email: string, password: string) => Promise<void>
  signup: (email: string, password: string, name: string) => Promise<{ needsEmailConfirmation: boolean }>
  signInWithGoogle: () => Promise<void>
  logout: () => Promise<void>
  /** Reset idle timer (after PIN unlock, etc.). */
  resetSessionActivity: () => void
  isLoading: boolean
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const supabase = useMemo(() => createSupabaseBrowser(), [])
  const [user, setUser] = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
    clearLegacySupabaseAuthCookiesOnce()
    let active = true

    supabase.auth
      .getUser()
      .then(({ data }) => {
        if (!active) return
        setUser(data.user ?? null)
      })
      .finally(() => {
        if (!active) return
        setIsLoading(false)
      })

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
      if (!session) {
        clearBusinessAppSessionCookie()
      }
    })

    return () => {
      active = false
      sub.subscription.unsubscribe()
    }
  }, [supabase])

  useEffect(() => {
    if (!user?.id) return

    const bootstrap = async () => {
      const { data } = await supabase.auth.getSession()
      if (!data.session) return

      const onboarding = getOnboarding()
      const countryCode = onboarding?.countryCode?.trim() || undefined
      const role = "business"
      const fullNameFromMeta =
        typeof user.user_metadata?.name === "string"
          ? user.user_metadata.name
          : [user.user_metadata?.first_name, user.user_metadata?.last_name].filter(Boolean).join(" ")

      try {
        await fetchWithSession("/api/auth/bootstrap", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...(countryCode ? { countryCode } : {}),
            role,
            fullName: fullNameFromMeta || null,
          }),
        })
      } catch (error) {
        console.error("auth bootstrap failed", error)
      }
    }

    void bootstrap()
  }, [supabase, user?.id])

  useEffect(() => {
    if (!user?.id) return
    void import("@/lib/use-payout-corridors").then((m) => m.prefetchPayoutCorridors())
  }, [user?.id])

  useEffect(() => {
    if (user?.id) {
      resetSessionActivity()
    }
  }, [user?.id])

  const login = async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    })
    if (error) throw error
    if (data.user?.id) {
      analytics.identify(data.user.id, { email: data.user.email || email.trim() })
      analytics.trackSignIn("email", { userId: data.user.id })
    }
  }

  const signup = async (email: string, password: string, name: string) => {
    const origin = typeof window !== "undefined" ? window.location.origin : ""
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        data: { name: name.trim() },
        emailRedirectTo: `${origin}/auth/callback`,
      },
    })
    if (error) throw error
    if (data.user?.id) {
      analytics.identify(data.user.id, {
        email: data.user.email || email.trim(),
        name: name.trim(),
      })
      analytics.trackSignUp("email", {
        userId: data.user.id,
        needsEmailConfirmation: !data.session,
      })
    }
    return { needsEmailConfirmation: !data.session }
  }

  const signInWithGoogle = async () => {
    const origin = typeof window !== "undefined" ? window.location.origin : ""
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${origin}/auth/callback`,
      },
    })
    if (error) throw error
    analytics.trackSignIn("google")
  }

  const logout = async () => {
    try {
      const { data } = await supabase.auth.getUser()
      const uid = data.user?.id
      if (uid) removePin(uid)
    } catch {
      // ignore
    }
    clearBusinessAppSessionCookie()
    analytics.trackSignOut({ userId: user?.id || null })
    analytics.reset()
    await supabase.auth.signOut()
  }

  const ctxValue = {
    user,
    login,
    signup,
    signInWithGoogle,
    logout,
    resetSessionActivity,
    isLoading,
  }

  // Don't render until mounted to prevent hydration mismatch
  if (!mounted) {
    return (
      <AuthContext.Provider
        value={{ user: null, login, signup, signInWithGoogle, logout, resetSessionActivity, isLoading: true }}
      >
        {children}
      </AuthContext.Provider>
    )
  }

  return (
    <AuthContext.Provider value={ctxValue}>
      <IdleSessionBridge />
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider")
  }
  return context
}
