import { useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import {
  attachRealtime,
  mapLedgerRowToMobileListItem,
  type IdentityChangeEvent,
  type RealtimeHealth,
} from '@easner/shared'
import { supabase } from '../lib/supabase'
import { useMaybeScope } from './scope'

/**
 * Hook that attaches the shared Supabase Realtime → TanStack Query bridge
 * for the current mobile scope.
 *
 * Lifecycle:
 *   - Subscribes when a scope appears; tears down + re-subscribes when the
 *     scope changes (rare, only on account switch / re-auth).
 *   - Unsubscribes on unmount.
 *   - Surfaces `health` for UI banners (e.g. "reconnecting…").
 */
export function useSupabaseRealtimeScope(options?: {
  onIdentityChange?: (event: IdentityChangeEvent) => void
}): RealtimeHealth {
  const qc = useQueryClient()
  const scope = useMaybeScope()
  const scopeKey = scope ? `${scope.kind}:${scope.userId}` : null
  const [health, setHealth] = useState<RealtimeHealth>({
    subscribed: false,
    lastEventAt: null,
    lastError: null,
  })
  const lastScopeRef = useRef<string | null>(null)
  const onIdentityChangeRef = useRef(options?.onIdentityChange)
  onIdentityChangeRef.current = options?.onIdentityChange

  useEffect(() => {
    if (!scope) return
    lastScopeRef.current = scopeKey
    const detach = attachRealtime({
      qc,
      scope,
      supabase,
      onHealth: setHealth,
      onIdentityChange: (event) => onIdentityChangeRef.current?.(event),
      mapTransactionInsert: (row) => {
        try {
          return mapLedgerRowToMobileListItem(row)
        } catch {
          return null
        }
      },
    })
    return () => {
      detach()
      setHealth({ subscribed: false, lastEventAt: null, lastError: null })
    }
    // scopeKey is a stable stringified identifier; re-subscribe only on change.
  }, [scopeKey, qc, scope])

  return health
}
