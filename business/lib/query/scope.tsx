"use client"

import * as React from "react"
import type { BusinessScope } from "@easner/shared"
import { useAuth } from "@/lib/auth-context"

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

  const derived = React.useMemo<BusinessScope | null>(() => {
    if (!user?.id) return null
    return { kind: "business", orgId: user.id, entityId: user.id }
  }, [user?.id])

  const value = React.useMemo<BusinessScopeContextValue>(() => {
    const scope = override ?? derived
    return {
      scope,
      setScope: setOverride,
      isReady: scope !== null,
    }
  }, [override, derived])

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
