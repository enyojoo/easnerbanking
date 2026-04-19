import { createBaseQueryClient } from '@easner/shared'
import type { QueryClient } from '@tanstack/react-query'

/**
 * Per-user QueryClient for Easner mobile.
 *
 * We keep one client alive for the lifetime of the JS bundle. On sign-out the
 * client is cleared (see `resetQueryClient`) rather than replaced, so the
 * persister keeps writing to the same AsyncStorage key and the UI doesn't
 * have to remount the provider.
 */

let client: QueryClient | null = null

export function getMobileQueryClient(): QueryClient {
  if (!client) {
    client = createBaseQueryClient({
      defaultOptions: {
        queries: {
          // Mobile networks are slower/spikier — give a touch more room
          // before refetching, and keep cached pages in memory longer so
          // returning to a screen feels instant.
          staleTime: 45_000,
          gcTime: 30 * 60_000,
          // On mobile we hook into AppState rather than window focus;
          // realtime + explicit pull-to-refresh drive the rest.
          refetchOnWindowFocus: false,
          refetchOnReconnect: 'always',
          refetchOnMount: false,
        },
      },
    })
  }
  return client
}

/** Clear queries + mutations on sign-out without replacing the client instance. */
export async function resetQueryClient(): Promise<void> {
  if (!client) return
  client.cancelQueries()
  client.clear()
}
