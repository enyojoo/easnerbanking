import React, { useCallback } from 'react'
import { useFocusEffect } from '@react-navigation/native'
import { isChannelHealthy, type RealtimeHealth } from '@easner/shared'

interface UseTransactionListFocusRefreshOptions {
  /** The TanStack Query result for the transaction list (`useTransactionsList()`). */
  txQuery: { refetch: () => Promise<unknown> }
  /** Current realtime channel health from `useRealtimeHealth()`. */
  realtimeHealth: RealtimeHealth
  /**
   * Optional async function that runs the chain-ledger sync and returns
   * `true` if it inserted new rows that require a ledger refetch.
   * Always runs when provided — it may insert rows even when realtime is healthy.
   */
  onChainSync?: () => Promise<boolean>
}

/**
 * Replaces raw `useFocusEffect(txQuery.refetch)` calls in screens.
 *
 * Strategy:
 * - Always run `onChainSync` when provided (may insert stablecoin rows that
 *   realtime doesn't cover).
 * - Only call `txQuery.refetch()` when:
 *   1. The realtime channel is NOT healthy (fallback for missed events), OR
 *   2. `onChainSync` reported newly inserted rows (not delivered via realtime).
 *
 * Pull-to-refresh and manual refresh buttons call `txQuery.refetch()` directly
 * and are unaffected by this hook.
 */
export function useTransactionListFocusRefresh({
  txQuery,
  realtimeHealth,
  onChainSync,
}: UseTransactionListFocusRefreshOptions): void {
  // Stable refs so deps don't change on every render.
  const txQueryRef = React.useRef(txQuery)
  txQueryRef.current = txQuery

  const realtimeHealthRef = React.useRef(realtimeHealth)
  realtimeHealthRef.current = realtimeHealth

  const onChainSyncRef = React.useRef(onChainSync)
  onChainSyncRef.current = onChainSync

  useFocusEffect(
    useCallback(() => {
      void (async () => {
        let chainInserted = false
        if (onChainSyncRef.current) {
          try {
            chainInserted = await onChainSyncRef.current()
          } catch {
            // Chain sync errors are non-fatal; continue.
          }
        }

        const healthy = isChannelHealthy(realtimeHealthRef.current)
        if (!healthy || chainInserted) {
          await txQueryRef.current.refetch()
        }
      })()
    }, []),
  )
}
