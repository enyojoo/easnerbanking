/**
 * Shared TanStack Query v5 configuration.
 *
 * `createBaseQueryClient()` produces the canonical QueryClient used on web
 * (per-request on the server, singleton in the browser) and on mobile (one
 * per signed-in user). Per-domain overrides live next to each hook via
 * `staleTime` / `refetchInterval` or via `meta`:
 *
 *   - `meta.safePersist`   → persist to disk on mobile (non-sensitive only)
 *   - `meta.noDehydrate`   → skip SSR hydration for this query
 *
 * Defaults are tuned for a fintech SWR feel:
 *   - 30s default staleTime, 10min gcTime
 *   - refetch on window focus / reconnect, NOT on mount (trust the cache;
 *     realtime + focus keep things fresh without waterfalls)
 *   - limited retries, no retry on 4xx or auth errors
 *   - `placeholderData: keepPreviousData` so filtered/paginated lists
 *     don't blink back to skeletons between requests
 */

import {
  QueryClient,
  defaultShouldDehydrateQuery,
  keepPreviousData,
  type QueryClientConfig,
} from "@tanstack/react-query"

declare module "@tanstack/react-query" {
  interface Register {
    queryMeta: {
      /** Persist this query to AsyncStorage on mobile. Never for sensitive data. */
      safePersist?: boolean
      /** Exclude from SSR dehydration on web. */
      noDehydrate?: boolean
      /** Logical freshness band. Used by the realtime layer and UX rules. */
      freshness?: "critical" | "operational" | "reference" | "analytics"
    }
    mutationMeta: {
      /** Short label used in toast/error copy. */
      intent?: string
      /** True for money-moving or irreversible actions. */
      destructive?: boolean
    }
  }
}

export interface AuthErrorLike {
  status?: number
  statusCode?: number
  code?: string | number
}

export function isAuthError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false
  const e = err as AuthErrorLike
  const status = e.status ?? e.statusCode
  if (status === 401 || status === 403) return true
  if (typeof e.code === "string" && /auth|unauthori[sz]ed|forbidden/i.test(e.code)) return true
  return false
}

export function isClientError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false
  const status = (err as AuthErrorLike).status ?? (err as AuthErrorLike).statusCode
  return typeof status === "number" && status >= 400 && status < 500
}

export function createBaseQueryClient(overrides?: QueryClientConfig): QueryClient {
  return new QueryClient({
    ...overrides,
    defaultOptions: {
      ...overrides?.defaultOptions,
      queries: {
        staleTime: 30_000,
        gcTime: 10 * 60_000,
        refetchOnWindowFocus: "always",
        refetchOnReconnect: "always",
        refetchOnMount: false,
        retry: (count, err) => {
          if (isAuthError(err)) return false
          if (isClientError(err)) return false
          return count < 2
        },
        retryDelay: (i) => Math.min(500 * 2 ** i, 4_000),
        networkMode: "online",
        structuralSharing: true,
        placeholderData: keepPreviousData,
        ...overrides?.defaultOptions?.queries,
      },
      mutations: {
        retry: 0,
        networkMode: "online",
        ...overrides?.defaultOptions?.mutations,
      },
      dehydrate: {
        shouldDehydrateQuery: (q) =>
          defaultShouldDehydrateQuery(q) && q.meta?.noDehydrate !== true,
        ...overrides?.defaultOptions?.dehydrate,
      },
    },
  })
}
