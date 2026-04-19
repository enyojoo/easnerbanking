import { useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { attachRealtime, type RealtimeHealth } from '@easner/shared'
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
export function useSupabaseRealtimeScope(): RealtimeHealth {
  const qc = useQueryClient()
  const scope = useMaybeScope()
  const scopeKey = scope ? `${scope.kind}:${scope.userId}` : null
  const [health, setHealth] = useState<RealtimeHealth>({
    subscribed: false,
    lastEventAt: null,
    lastError: null,
  })
  const lastScopeRef = useRef<string | null>(null)

  useEffect(() => {
    if (!scope) return
    lastScopeRef.current = scopeKey
    const detach = attachRealtime({
      qc,
      scope,
      supabase,
      onHealth: setHealth,
    })
    return () => {
      detach()
      setHealth({ subscribed: false, lastEventAt: null, lastError: null })
    }
    // scopeKey is a stable stringified identifier; re-subscribe only on change.
  }, [scopeKey, qc, scope])

  return health
}
