import { useCallback } from 'react'
import { useQueryClient, type FetchQueryOptions, type QueryKey } from '@tanstack/react-query'

/**
 * Mobile counterpart to web's `useHoverPrefetch`.
 *
 * React Native has no hover, so we prefetch on `onPressIn`: the first
 * frame of a touch is the user's commitment signal, and detail screens
 * typically take 80-150ms to transition – ample room to swap the
 * network fetch under the animation. Returning from the detail screen
 * then also uses the fresh cache.
 *
 * Example:
 *   const prefetch = usePressPrefetch({
 *     queryKey: qk.transactions.detail(scope, tx.id),
 *     queryFn: () => apiFetch(`/api/transactions/${tx.id}`),
 *     staleTime: 45_000,
 *   })
 *   return <Pressable onPressIn={prefetch} onPress={openDetail}>…</Pressable>
 */
export function usePressPrefetch<T>(options: FetchQueryOptions<T, Error, T, QueryKey>) {
  const qc = useQueryClient()
  return useCallback(() => {
    void qc.prefetchQuery(options)
  }, [qc, options])
}
