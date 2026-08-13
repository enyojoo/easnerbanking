"use client"

import * as React from "react"
import type { BusinessScope } from "@easner/shared"
import { useAuth } from "@/lib/auth-context"
import { fetchWithSession } from "@/lib/fetch-with-session"
import { readBusinessStartupSnapshot, probeStoredSupabaseSession } from "@/lib/query/web-persist"

/**
 * Client-side scope context for the Easner Business app.
 *
 * Scope model:
 *   - `orgId`    → the user's business id (canonical org identifier).
 *   - `entityId` → the active legal entity under that org.
 *
 * Until a formal multi-entity model ships, we alias both to the
 * authenticated user id so scoped queries remain cache-isolated per
 * user without having to rewrite call sites when entity selection
 * lands. The entire app reads scope via `useScope()` and switching
 * entities becomes a one-liner (update the signed cookie, call
 * `setScope`).
 */

export type BusinessScopeContextValue = {
  scope: BusinessScope | null
  setScope: (next: BusinessScope) => void
  isReady: boolean
}

const ScopeContext = React.createContext<BusinessScopeContextValue | undefined>(undefined)

export function BusinessScopeProvider({ children }: { children: React.ReactNode }) {
  const { user, sessionUserId } = useAuth()
  const [bootProbe] = React.useState(() =>
    typeof window !== "undefined"
      ? probeStoredSupabaseSession()
      : { userId: null as string | null, likelyAuthenticated: false },
  )
  const bootUserId = bootProbe.userId
  const scopeUserId = user?.id ?? sessionUserId ?? bootUserId
  const [override, setOverride] = React.useState<BusinessScope | null>(null)
  /** Always tagged with the user it belongs to so a switch cannot reuse the prior org id. */
  const [businessIdState, setBusinessIdState] = React.useState<{
    userId: string
    businessId: string | null
  } | null>(null)

  const seededOrgId = React.useMemo(() => {
    if (!scopeUserId) return null
    const startup = readBusinessStartupSnapshot()
    if (startup?.userId === scopeUserId && startup.businessId) {
      return startup.businessId
    }
    try {
      const raw = localStorage.getItem(`business_profile_cache_${scopeUserId}`)
      if (raw) {
        const parsed = JSON.parse(raw) as { data?: { businessId?: string | null } }
        const id = parsed?.data?.businessId ? String(parsed.data.businessId) : null
        if (id) return id
      }
    } catch {
      // ignore
    }
    return null
  }, [scopeUserId])

  const businessId =
    scopeUserId && businessIdState?.userId === scopeUserId
      ? (businessIdState.businessId ?? seededOrgId)
      : seededOrgId

  // Resolve org id for the signed-in user only. Reset immediately on user change so
  // the previous account's businessId never scopes wallets/queries for the next login.
  React.useEffect(() => {
    if (!scopeUserId) {
      setBusinessIdState(null)
      setOverride(null)
      return
    }

    let seeded: string | null = seededOrgId
    setBusinessIdState({ userId: scopeUserId, businessId: seeded })
    setOverride(null)

    if (!user?.id) return

    let cancelled = false
    void (async () => {
      try {
        const res = await fetchWithSession("/api/business/profile")
        if (!res.ok) return
        const json = (await res.json().catch(() => null)) as { profile?: { businessId?: string | null } } | null
        const id = json?.profile?.businessId ? String(json.profile.businessId) : null
        if (!cancelled) setBusinessIdState({ userId: scopeUserId, businessId: id })
      } catch {
        // ignore; fall back to scopeUserId scope
      }
    })()
    return () => {
      cancelled = true
    }
  }, [scopeUserId, user?.id, seededOrgId])

  const derived = React.useMemo<BusinessScope | null>(() => {
    if (!scopeUserId) return null
    const org = businessId ?? scopeUserId
    return { kind: "business", orgId: org, entityId: org }
  }, [businessId, scopeUserId])

  const value = React.useMemo<BusinessScopeContextValue>(() => {
    const scope =
      override && businessIdState?.userId === scopeUserId ? override : derived
    return {
      scope,
      setScope: setOverride,
      isReady: scope !== null,
    }
  }, [override, derived, businessIdState?.userId, scopeUserId])

  return <ScopeContext.Provider value={value}>{children}</ScopeContext.Provider>
}

export function useScope(): BusinessScopeContextValue {
  const ctx = React.useContext(ScopeContext)
  if (!ctx) {
    throw new Error("useScope must be used inside <BusinessScopeProvider>")
  }
  return ctx
}

/**
 * Assert-style helper for hooks that can't render without a scope.
 * Returns `null` instead of throwing so hooks can short-circuit with
 * `enabled: !!scope`.
 */
export function useMaybeScope(): BusinessScope | null {
  const { scope } = useScope()
  return scope
}
