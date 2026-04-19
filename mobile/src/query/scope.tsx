import React from 'react'
import type { PersonalScope } from '@easner/shared'
import { useAuth } from '../contexts/AuthContext'

/**
 * Personal scope context for Easner mobile.
 *
 * Single-entity model: `scope.userId` equals the authenticated Supabase user id.
 * All query keys and the realtime channel are keyed off this value, so signing
 * in as a different account cleanly isolates cache without any manual invalidation.
 */

export type PersonalScopeContextValue = {
  scope: PersonalScope | null
  isReady: boolean
}

const ScopeContext = React.createContext<PersonalScopeContextValue | undefined>(undefined)

export function PersonalScopeProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth()

  const value = React.useMemo<PersonalScopeContextValue>(() => {
    if (!user?.id) return { scope: null, isReady: false }
    const scope: PersonalScope = { kind: 'personal', userId: user.id }
    return { scope, isReady: true }
  }, [user?.id])

  return <ScopeContext.Provider value={value}>{children}</ScopeContext.Provider>
}

export function useScope(): PersonalScopeContextValue {
  const ctx = React.useContext(ScopeContext)
  if (!ctx) {
    throw new Error('useScope must be used inside <PersonalScopeProvider>')
  }
  return ctx
}

export function useMaybeScope(): PersonalScope | null {
  return useScope().scope
}
