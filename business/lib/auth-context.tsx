"use client"

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react"
import type { User } from "@supabase/supabase-js"
import { clearBusinessAppSessionCookie } from "@/lib/app-session-client"
import { fetchWithSession } from "@/lib/fetch-with-session"
import { clearLegacySupabaseAuthCookiesOnce } from "@/lib/supabase/clear-legacy-auth-cookies"
import { createSupabaseBrowser } from "@/lib/supabase/browser"
import { getOnboarding } from "@/lib/onboarding-store"

interface AuthContextType {
  user: User | null
  login: (email: string, password: string) => Promise<void>
  signup: (email: string, password: string, name: string) => Promise<{ needsEmailConfirmation: boolean }>
  signInWithGoogle: () => Promise<void>
  logout: () => Promise<void>
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
      const countryCode = onboarding?.countryCode || "US"
      const role = "business"
      const fullNameFromMeta =
        typeof user.user_metadata?.name === "string"
          ? user.user_metadata.name
          : [user.user_metadata?.first_name, user.user_metadata?.last_name].filter(Boolean).join(" ")

      try {
        await fetchWithSession("/api/auth/bootstrap", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ countryCode, role, fullName: fullNameFromMeta || null }),
        })
      } catch (error) {
        console.error("auth bootstrap failed", error)
      }
    }

    void bootstrap()
  }, [supabase, user?.id])

  const login = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    })
    if (error) throw error
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
  }

  const logout = async () => {
    clearBusinessAppSessionCookie()
    await supabase.auth.signOut()
  }

  // Don't render until mounted to prevent hydration mismatch
  if (!mounted) {
    return (
      <AuthContext.Provider value={{ user: null, login, signup, signInWithGoogle, logout, isLoading: true }}>
        {children}
      </AuthContext.Provider>
    )
  }

  return (
    <AuthContext.Provider value={{ user, login, signup, signInWithGoogle, logout, isLoading }}>
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
