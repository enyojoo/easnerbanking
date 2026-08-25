"use client"

import * as React from "react"
import type { BusinessScope } from "@easner/shared"
import { useAuth } from "@/lib/auth-context"
import { fetchBusinessProfileEnvelope } from "@/lib/business-profile-fetch"
import {
  EMPTY_STORED_SUPABASE_SESSION_PROBE,
  readBusinessStartupSnapshot,
  probeStoredSupabaseSession,
} from "@/lib/query/web-persist"

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
  const [bootProbe, setBootProbe] = React.useState(EMPTY_STORED_SUPABASE_SESSION_PROBE)
  const bootUserId = bootProbe.likelyAuthenticated ? bootProbe.userId : null
  const scopeUserId = user?.id ?? sessionUserId ?? bootUserId
  const [override, setOverride] = React.useState<BusinessScope | null>(null)
  /**
   * Always tagged with the user it belongs to so a switch cannot reuse the
   * prior org id. `resolved` is the flip-guard: scope stays `null` until the
   * business id is known (from the persisted seed, or the profile fetch on a
   * true first boot). Without it, an unseeded boot keyed every query by USER
   * id, then re-keyed them all by BUSINESS id when the profile resolved —
   * refetching the entire workspace twice and orphaning the first cache.
   */
  const [businessIdState, setBusinessIdState] = React.useState<{
    userId: string
    businessId: string | null
    resolved: boolean
  } | null>(null)

  React.useLayoutEffect(() => {
    setBootProbe(probeStoredSupabaseSession())
  }, [])

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

  const stateForUser =
    scopeUserId && businessIdState?.userId === scopeUserId ? businessIdState : null
  const businessId = stateForUser ? (stateForUser.businessId ?? seededOrgId) : seededOrgId
  const scopeResolved = Boolean(stateForUser?.resolved ?? seededOrgId)

  // Resolve org id for the signed-in user only. Reset immediately on user change so
  // the previous account's businessId never scopes wallets/queries for the next login.
  React.useEffect(() => {
    if (!scopeUserId) {
      setBusinessIdState(null)
      setOverride(null)
      return
    }

    const seeded: string | null = seededOrgId
    // A persisted seed resolves immediately (fast cache-first boot); an
    // unseeded first boot stays unresolved until the profile answers.
    setBusinessIdState({ userId: scopeUserId, businessId: seeded, resolved: Boolean(seeded) })
    setOverride(null)

    if (!user?.id) return

    let cancelled = false
    const resolveFallback = () => {
      // Profile unavailable: unblock with the seed (or user-id scope) rather
      // than deadlocking the workspace.
      if (!cancelled) {
        setBusinessIdState({ userId: scopeUserId, businessId: seeded, resolved: true })
      }
    }
    void (async () => {
      try {
        const json = await fetchBusinessProfileEnvelope()
        if (!json) {
          resolveFallback()
          return
        }
        const id = json.profile?.businessId ? String(json.profile.businessId) : null
        if (!cancelled) setBusinessIdState({ userId: scopeUserId, businessId: id, resolved: true })
      } catch {
        resolveFallback()
      }
    })()
    return () => {
      cancelled = true
    }
  }, [scopeUserId, user?.id, seededOrgId])

  const derived = React.useMemo<BusinessScope | null>(() => {
    if (!scopeUserId) return null
    if (!scopeResolved) return null
    const org = businessId ?? scopeUserId
    return { kind: "business", orgId: org, entityId: org }
  }, [businessId, scopeResolved, scopeUserId])

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
