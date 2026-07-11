"use client"

import * as React from "react"
import type { BusinessScope } from "@easner/shared"
import { useAuth } from "@/lib/auth-context"
import { fetchWithSession } from "@/lib/fetch-with-session"
import { readBusinessStartupSnapshot } from "@/lib/query/web-persist"

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
  const { user } = useAuth()
  const [override, setOverride] = React.useState<BusinessScope | null>(null)
  /** Always tagged with the user it belongs to so a switch cannot reuse the prior org id. */
  const [businessIdState, setBusinessIdState] = React.useState<{
    userId: string
    businessId: string | null
  } | null>(null)

  const businessId =
    user?.id && businessIdState?.userId === user.id ? businessIdState.businessId : null

  // Resolve org id for the signed-in user only. Reset immediately on user change so
  // the previous account's businessId never scopes wallets/queries for the next login.
  React.useEffect(() => {
    if (!user?.id) {
      setBusinessIdState(null)
      setOverride(null)
      return
    }

    let seeded: string | null = null
    const startup = readBusinessStartupSnapshot()
    if (startup?.userId === user.id && startup.businessId) {
      seeded = startup.businessId
    } else {
      try {
        const raw = localStorage.getItem(`business_profile_cache_${user.id}`)
        if (raw) {
          const parsed = JSON.parse(raw) as { data?: { businessId?: string | null }; timestamp?: number }
          const id = parsed?.data?.businessId ? String(parsed.data.businessId) : null
          if (id) seeded = id
        }
      } catch {
        // ignore
      }
    }
    setBusinessIdState({ userId: user.id, businessId: seeded })
    setOverride(null)

    let cancelled = false
    void (async () => {
      try {
        const res = await fetchWithSession("/api/business/profile")
        if (!res.ok) return
        const json = (await res.json().catch(() => null)) as { profile?: { businessId?: string | null } } | null
        const id = json?.profile?.businessId ? String(json.profile.businessId) : null
        if (!cancelled) setBusinessIdState({ userId: user.id, businessId: id })
      } catch {
        // ignore; fall back to user.id scope
      }
    })()
    return () => {
      cancelled = true
    }
  }, [user?.id])

  const derived = React.useMemo<BusinessScope | null>(() => {
    if (!user?.id) return null
    const org = businessId ?? user.id
    return { kind: "business", orgId: org, entityId: org }
  }, [businessId, user?.id])

  const value = React.useMemo<BusinessScopeContextValue>(() => {
    const scope =
      override && businessIdState?.userId === user?.id ? override : derived
    return {
      scope,
      setScope: setOverride,
      isReady: scope !== null,
    }
  }, [override, derived, businessIdState?.userId, user?.id])

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
