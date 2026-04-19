"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { attachRealtime, scopesEqual, type RealtimeHealth, type Scope, type SupabaseLikeClient } from "@easner/shared"
import { createSupabaseBrowser } from "@/lib/supabase/browser"

/**
 * Attach the shared Supabase → TanStack Query bridge for the current scope.
 *
 * - Re-subscribes when `scope` changes (never tears down the shell).
 * - Exposes a `health` object so surfaces can show subtle "reconnecting"
 *   banners without owning their own channel.
 * - One channel per scope across the entire app; individual screens never
 *   open their own `postgres_changes` listeners.
 */
export function useSupabaseRealtimeScope(scope: Scope | null) {
  const qc = useQueryClient()
  const [health, setHealth] = useState<RealtimeHealth>({
    subscribed: false,
    lastEventAt: null,
    lastError: null,
  })
  const scopeRef = useRef<Scope | null>(null)

  const supabase = useMemo<SupabaseLikeClient | null>(() => {
    if (typeof window === "undefined") return null
    return createSupabaseBrowser() as unknown as SupabaseLikeClient
  }, [])

  useEffect(() => {
    if (!scope || !supabase) return
    if (scopesEqual(scopeRef.current, scope)) return
    scopeRef.current = scope

    const detach = attachRealtime({
      qc,
      scope,
      supabase,
      onHealth: setHealth,
    })
    return () => {
      scopeRef.current = null
      detach()
    }
  }, [qc, scope, supabase])

  return health
}
