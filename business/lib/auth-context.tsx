"use client"

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react"
import type { User } from "@supabase/supabase-js"
import { clearBusinessAppSessionCookie } from "@/lib/app-session-client"
import { ensureBusinessAppSession } from "@/lib/app-session-client"
import { fetchWithSession } from "@/lib/fetch-with-session"
import { clearLegacySupabaseAuthCookiesOnce } from "@/lib/supabase/clear-legacy-auth-cookies"
import { createSupabaseBrowser } from "@/lib/supabase/browser"
import { getOnboarding } from "@/lib/onboarding-store"
import { removePin } from "@/lib/login-pin"
import { resetSessionActivity } from "@/lib/session-activity"
import { IdleSessionBridge } from "@/components/idle-session-bridge"
import { analytics } from "@/lib/analytics"
import { ensureBusinessWebSurface } from "@/lib/auth/validate-surface-client"
import { clearBrowserQueryClient } from "@/lib/query/query-client"
import { clearAllBusinessBrowserState } from "@/lib/query/web-persist"
import { clearPendingTeamInvite, getPendingTeamInvite } from "@/lib/team-invite-storage"
import {
  isAppleWebSignInCanceled,
  signInWithAppleWeb,
} from "@/lib/auth/apple-sign-in-web"
import {
  applePrivateRelayFromIdToken,
  signupEmailBlockMessageForCode,
  SIGNUP_EMAIL_BLOCK_MESSAGES,
  SIGNUP_EXISTING_ACCOUNT_SAME_SURFACE,
  isSupabaseSignupDuplicateUser,
  mapSupabaseSignupDuplicateError,
  mapOtpVerifyErrorMessage,
} from "@easner/shared"
import {
  isSignupEmailBlockCode,
  stashSignupBlockedMessage,
} from "@/lib/auth/signup-blocked-message"
import { runBusinessBootstrapClient } from "@/lib/auth/run-business-bootstrap-client"
import { probeStoredSupabaseSession } from "@/lib/query/web-persist"
import { redirectToWorkspaceLogin } from "@/lib/auth/workspace-login-redirect"

function parseAuthFragment(hash: string): Record<string, string> {
  const raw = hash.replace(/^#/, "")
  const params = new URLSearchParams(raw)
  const out: Record<string, string> = {}
  params.forEach((value, key) => {
    out[key] = value
  })
  return out
}

interface AuthContextType {
  user: User | null
  login: (email: string, password: string) => Promise<void>
  signup: (email: string, password: string, name: string) => Promise<{ needsEmailConfirmation: boolean }>
  verifySignupOtp: (email: string, otp: string) => Promise<void>
  resendSignupOtp: (email: string) => Promise<void>
  signInWithGoogle: () => Promise<void>
  signInWithApple: () => Promise<void>
  logout: () => Promise<void>
  /** Reset idle timer (after PIN unlock, etc.). */
  resetSessionActivity: () => void
  isLoading: boolean
  /** Supabase user id when confirmed, else last-known id from local session storage for cache/scope bootstrap. */
  sessionUserId: string | null
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const supabase = useMemo(() => createSupabaseBrowser(), [])
  const [user, setUser] = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [mounted, setMounted] = useState(false)
  const [storedProbe] = useState(() =>
    typeof window !== "undefined"
      ? probeStoredSupabaseSession()
      : { userId: null as string | null, likelyAuthenticated: false },
  )
  const restoredUserId = storedProbe.userId
  const sessionUserId = user?.id ?? restoredUserId
  const bootstrapFullName = useMemo(() => {
    if (!user) return ""
    const fullNameFromMeta =
      typeof user.user_metadata?.name === "string"
        ? user.user_metadata.name
        : [user.user_metadata?.first_name, user.user_metadata?.last_name].filter(Boolean).join(" ")
    return String(fullNameFromMeta ?? "").trim()
  }, [user])

  useEffect(() => {
    setMounted(true)
    clearLegacySupabaseAuthCookiesOnce()
    let active = true

    const consumeAuthCallbackIfPresent = async () => {
      if (typeof window === "undefined") return

      // Support OAuth and email verification without a dedicated callback UI route.
      const url = new URL(window.location.href)
      const code = url.searchParams.get("code")
      const tokenHash = url.searchParams.get("token_hash")
      const type = url.searchParams.get("type")
      const qsError = url.searchParams.get("error")
      const qsErrorDesc = url.searchParams.get("error_description")

      const frag = window.location.hash && window.location.hash.length > 1 ? parseAuthFragment(window.location.hash) : null
      const fragError = frag?.error
      const fragErrorDesc = frag?.error_description

      if (qsError || fragError) {
        const message = (qsErrorDesc || fragErrorDesc || qsError || fragError || "Authentication error").toString()
        window.history.replaceState({}, "", url.pathname)
        window.location.replace(`/auth/login?message=${encodeURIComponent(message)}`)
        return
      }

      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code)
        if (error) throw error
        window.history.replaceState({}, "", url.pathname)
        return
      }

      if (tokenHash && type) {
        const { error } = await supabase.auth.verifyOtp({ type: type as any, token_hash: tokenHash })
        if (error) throw error
        // Preserve `type=recovery` so reset-password flow still works.
        if (type === "recovery") {
          window.history.replaceState({}, "", url.pathname)
          window.location.replace("/auth/reset-password")
          return
        }
        window.history.replaceState({}, "", url.pathname)
        return
      }

      const accessToken = frag?.access_token
      const refreshToken = frag?.refresh_token
      if (accessToken && refreshToken) {
        const { error } = await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken })
        if (error) throw error
        window.history.replaceState({}, "", url.pathname)
      }
    }

    void (async () => {
      try {
        await consumeAuthCallbackIfPresent()
      } catch (e) {
        console.warn("AuthProvider callback consume failed", e)
        if (typeof window !== "undefined") {
          const msg = e instanceof Error ? e.message : "This link is invalid or expired."
          window.location.replace(`/auth/login?message=${encodeURIComponent(msg)}`)
          return
        }
      }

      const { data } = await supabase.auth.getSession()
      if (!active) return
      const nextUser = data.session?.user ?? null
      if (!nextUser) {
        clearBrowserQueryClient()
        clearAllBusinessBrowserState()
        setIsLoading(false)
        redirectToWorkspaceLogin()
        return
      }
      setUser(nextUser)
      setIsLoading(false)
    })()

    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_IN") {
        resetSessionActivity()
      }
      setUser((prev) => {
        const nextUser = session?.user ?? null
        if (!nextUser) {
          if (prev?.id) clearAllBusinessBrowserState(prev.id)
          clearBrowserQueryClient()
          return null
        }
        if (prev?.id && prev.id !== nextUser.id) {
          clearAllBusinessBrowserState(prev.id)
          clearBrowserQueryClient()
        }
        return nextUser
      })
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
      // Only mark the throttle AFTER a successful bootstrap so a failed/partial run (e.g. org link never
      // persisted) retries on the next mount instead of being suppressed for 6h.
      const throttleKey = `easner_business_bootstrap_v1_${user.id}`
      const countryAppliedKey = `easner_business_country_applied_v1_${user.id}`

      // The country picked at signup only reaches the org through this (deferred, best-effort) bootstrap.
      // If a signup country is still pending (not yet confirmed applied), run even when throttled so it
      // reliably propagates to Business settings instead of being silently dropped.
      const onboarding = getOnboarding()
      const countryCode = onboarding?.countryCode?.trim() || undefined
      let countryAlreadyApplied = false
      try {
        countryAlreadyApplied = localStorage.getItem(countryAppliedKey) === "1"
      } catch {
        // ignore storage errors
      }
      const hasPendingCountry = Boolean(countryCode) && !countryAlreadyApplied
      const pendingInvite = getPendingTeamInvite()
      const hasPendingInvite = Boolean(pendingInvite?.membershipId)

      try {
        const raw = localStorage.getItem(throttleKey)
        const last = raw ? Number(raw) : 0
        const MIN_MS = 6 * 60 * 60 * 1000 // 6h
        if (!hasPendingCountry && !hasPendingInvite && Number.isFinite(last) && last > 0 && Date.now() - last < MIN_MS) {
          return
        }
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

      const role = "business"

      try {
        const bootRes = await fetchWithSession("/api/auth/bootstrap", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...(countryCode ? { countryCode } : {}),
            role,
            ...(bootstrapFullName ? { fullName: bootstrapFullName } : {}),
            ...(pendingInvite?.membershipId ? { membershipId: pendingInvite.membershipId } : {}),
          }),
        })
        const bootJson = (await bootRes.json().catch(() => ({}))) as {
          joinedViaInvite?: boolean
          turnkeySubOrgReady?: boolean
          error?: string
          code?: string
        }
        if (bootRes.ok) {
          if (bootJson.joinedViaInvite) {
            clearPendingTeamInvite()
          }
          try {
            localStorage.setItem(throttleKey, String(Date.now()))
            // Server backfills org country (idempotent, only when empty); mark applied so we don't
            // keep force-running past the throttle once the signup country has landed on the org.
            if (countryCode) localStorage.setItem(countryAppliedKey, "1")
          } catch {
            // ignore storage errors
          }
          if (bootJson.turnkeySubOrgReady !== true) {
            try {
              const er = await fetchWithSession("/api/wallets/ensure-sub-org", {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  "X-Easner-Account-Scope": "business",
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
        } else if (isSignupEmailBlockCode(bootJson.code)) {
          const msg =
            signupEmailBlockMessageForCode(bootJson.code) ||
            bootJson.error ||
            "This email can't be used to sign up."
          stashSignupBlockedMessage(msg)
          await supabase.auth.signOut()
          if (typeof window !== "undefined") {
            window.location.replace("/auth/signup")
          }
        } else if (hasPendingInvite) {
          console.warn("team invite bootstrap failed:", bootRes.status, bootJson.error ?? bootJson.code)
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
  }, [bootstrapFullName, supabase, user?.id])

  useEffect(() => {
    if (!user?.id) return
    void import("@/lib/use-send-destinations").then((m) => m.prefetchSendDestinations())
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
    await ensureBusinessAppSession(true)
  }

  const signup = async (email: string, password: string, name: string) => {
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        data: { name: name.trim() },
      },
    })
    if (error) {
      const mapped = mapSupabaseSignupDuplicateError(error.message)
      throw mapped ? new Error(mapped) : error
    }
    if (isSupabaseSignupDuplicateUser(data.user)) {
      throw new Error(SIGNUP_EXISTING_ACCOUNT_SAME_SURFACE)
    }
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

  const verifySignupOtp = async (email: string, otp: string) => {
    const token = otp.replace(/\D/g, "").slice(0, 6)
    if (token.length !== 6) {
      throw new Error("Enter the 6-digit code from your email.")
    }
    const { data, error } = await supabase.auth.verifyOtp({
      email: email.trim(),
      token,
      type: "signup",
    })
    if (error) throw new Error(mapOtpVerifyErrorMessage(error.message))

    const verifiedUser = data.session?.user ?? data.user
    const verifiedFullName =
      typeof verifiedUser?.user_metadata?.name === "string"
        ? verifiedUser.user_metadata.name.trim()
        : [verifiedUser?.user_metadata?.first_name, verifiedUser?.user_metadata?.last_name]
            .filter(Boolean)
            .join(" ")
            .trim() || undefined

    await ensureBusinessWebSurface(supabase)
    await ensureBusinessAppSession(true)

    const boot = await runBusinessBootstrapClient({ fullName: verifiedFullName })
    if (!boot.ok) {
      console.warn("signup bootstrap after OTP verify:", boot.error ?? boot.code)
    }
  }

  const resendSignupOtp = async (email: string) => {
    const addr = email.trim()
    if (!addr) throw new Error("Enter your email address first.")
    const { error } = await supabase.auth.resend({
      type: "signup",
      email: addr,
    })
    if (error) throw new Error(error.message || "Unable to resend code.")
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

  const signInWithApple = async () => {
    try {
      const { idToken, fullName } = await signInWithAppleWeb()
      if (applePrivateRelayFromIdToken(idToken)) {
        throw new Error(SIGNUP_EMAIL_BLOCK_MESSAGES.APPLE_PRIVATE_RELAY_EMAIL)
      }

      const { error: signInError } = await supabase.auth.signInWithIdToken({
        provider: "apple",
        token: idToken,
      })
      if (signInError) throw signInError

      if (fullName) {
        await supabase.auth.updateUser({ data: { name: fullName, full_name: fullName } })
      }

      analytics.trackSignIn("apple")
      await ensureBusinessWebSurface(supabase)
      await ensureBusinessAppSession(true)
    } catch (error) {
      if (isAppleWebSignInCanceled(error)) return
      throw error
    }
  }

  const logout = async () => {
    const currentUserId = user?.id ?? null
    try {
      const { data } = await supabase.auth.getUser()
      const uid = data.user?.id
      if (uid) removePin(uid)
    } catch {
      // ignore
    }
    clearBusinessAppSessionCookie()
    clearBrowserQueryClient()
    clearAllBusinessBrowserState(currentUserId)
    analytics.trackSignOut({ userId: user?.id || null })
    analytics.reset()
    await supabase.auth.signOut()
  }

  const ctxValue = {
    user,
    login,
    signup,
    verifySignupOtp,
    resendSignupOtp,
    signInWithGoogle,
    signInWithApple,
    logout,
    resetSessionActivity,
    isLoading,
    sessionUserId,
  }

  // Don't render until mounted to prevent hydration mismatch
  if (!mounted) {
    return (
      <AuthContext.Provider
        value={{
          user: null,
          login,
          signup,
          verifySignupOtp,
          resendSignupOtp,
          signInWithGoogle,
          signInWithApple,
          logout,
          resetSessionActivity,
          isLoading: true,
          sessionUserId: storedProbe.userId,
        }}
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
