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
import { ensureBusinessWebSurface } from "@/lib/auth/validate-surface-client"

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
      // Throttle bootstrap on reload; it's idempotent server-side but can compete with initial navigation.
      try {
        const key = `easner_business_bootstrap_v1_${user.id}`
        const raw = localStorage.getItem(key)
        const last = raw ? Number(raw) : 0
        const MIN_MS = 6 * 60 * 60 * 1000 // 6h
        if (Number.isFinite(last) && last > 0 && Date.now() - last < MIN_MS) {
          return
        }
        localStorage.setItem(key, String(Date.now()))
      } catch {
        // ignore storage errors
      }

      const { data } = await supabase.auth.getSession()
      if (!data.session) return
      try {
        await ensureBusinessWebSurface(supabase)
      } catch (error) {
        console.error("business surface validation failed", error)
        return
      }

      const onboarding = getOnboarding()
      const countryCode = onboarding?.countryCode?.trim() || undefined
      const role = "business"
      const fullNameFromMeta =
        typeof user.user_metadata?.name === "string"
          ? user.user_metadata.name
          : [user.user_metadata?.first_name, user.user_metadata?.last_name].filter(Boolean).join(" ")
      const trimmedBootstrapName = String(fullNameFromMeta ?? "").trim()

      try {
        const bootRes = await fetchWithSession("/api/auth/bootstrap", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...(countryCode ? { countryCode } : {}),
            role,
            ...(trimmedBootstrapName ? { fullName: trimmedBootstrapName } : {}),
          }),
        })
        if (bootRes.ok) {
          try {
            const er = await fetchWithSession("/api/wallets/ensure-sub-org", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "X-Easner-Noah-Scope": "business",
              },
            })
            if (!er.ok) {
              const text = await er.text().catch(() => "")
              console.warn("ensure-sub-org after bootstrap:", er.status, text)
            }
          } catch (e) {
            console.warn("ensure-sub-org error:", e)
          }
        }
      } catch (error) {
        console.error("auth bootstrap failed", error)
      }
    }

    // Run bootstrap after first paint / in idle time to avoid blocking initial interactivity.
    const w = window as any
    if (typeof w.requestIdleCallback === "function") {
      const id = w.requestIdleCallback(() => void bootstrap(), { timeout: 2000 })
      return () => w.cancelIdleCallback?.(id)
    }
    const t = window.setTimeout(() => void bootstrap(), 350)
    return () => window.clearTimeout(t)
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
    await ensureBusinessWebSurface(supabase)
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
