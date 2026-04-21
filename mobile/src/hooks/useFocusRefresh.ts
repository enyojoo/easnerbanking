import React, { useRef } from 'react'
import { useFocusEffect } from '@react-navigation/native'
import { useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../contexts/AuthContext'
import { useScope } from '../query/scope'
import { invalidateAllUserFeeds } from '../query/refresh-user-feeds'

/**
 * Hook to refresh data when screen comes into focus
 * Only refreshes if data is stale (> 5 minutes old by default)
 * 
 * @param refreshFn - Function to call for refresh
 * @param staleThreshold - Time in milliseconds before data is considered stale (default: 5 minutes)
 * @param force - If true, always refresh regardless of staleness
 */
export function useFocusRefresh(
  refreshFn: () => Promise<void> | void,
  staleThreshold: number = 5 * 60 * 1000, // 5 minutes default
  force: boolean = false
) {
  const lastRefreshTime = useRef<number>(0)
  /** Inline `refreshFn` from call sites changes every render — must not be a focus-effect dep or we loop refetch → render → new fn → refocus logic. */
  const refreshFnRef = useRef(refreshFn)
  refreshFnRef.current = refreshFn

  useFocusEffect(
    React.useCallback(() => {
      const now = Date.now()
      const timeSinceLastRefresh = now - lastRefreshTime.current
      
      // Refresh if forced, or if data is stale
      if (force || timeSinceLastRefresh > staleThreshold) {
        lastRefreshTime.current = now
        Promise.resolve(refreshFnRef.current()).catch(error => {
          console.warn('Focus refresh error:', error)
        })
      }
    }, [staleThreshold, force])
  )
}

/**
 * Hook to refresh all user data when screen comes into focus
 * Invalidates TanStack Query caches for currencies, FX, recipients, txs, VA payment methods, comm prefs.
 */
export function useFocusRefreshAll(force: boolean = false) {
  const qc = useQueryClient()
  const { scope } = useScope()
  const { user } = useAuth()
  useFocusRefresh(
    async () => {
      if (!scope || !user?.id) return
      await invalidateAllUserFeeds(qc, scope, user.id)
    },
    5 * 60 * 1000,
    force,
  )
}

