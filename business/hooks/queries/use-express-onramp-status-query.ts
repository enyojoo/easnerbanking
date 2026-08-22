"use client"

import { useEffect, useMemo } from "react"
import { useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query"
import { isChannelHealthy, pollingIntervalFor, qk, type Scope } from "@easner/shared"
import { useAuth } from "@/lib/auth-context"
import { useDocumentVisibility } from "@/lib/query/use-document-visibility"
import { useRealtimeHealth } from "@/lib/query/realtime-health-context"
import { useMaybeScope } from "@/lib/query/scope"
import {
  fetchBusinessExpressOnrampStatus,
  peekBusinessExpressOnrampStatus,
  type BusinessExpressOnrampStatus,
} from "@/lib/express-onramp-status-cache"

const STALE_MS = 15_000

function expressNeedsLiveUpdates(data: BusinessExpressOnrampStatus | undefined): boolean {
  if (!data || data.eligible === false) return false
  return data.ready !== true
}

export function expressOnrampStatusQueryOptions(scope: Scope, userId?: string | null) {
  return {
    queryKey: qk.verification.expressOnramp(scope),
    queryFn: () => fetchBusinessExpressOnrampStatus(true, userId),
    staleTime: STALE_MS,
    gcTime: 30 * 60_000,
    refetchOnMount: "always" as const,
    meta: { safePersist: true, webPersist: "reduced" as const, freshness: "operational" as const },
  }
}

export function useBusinessExpressOnrampStatus() {
  const scope = useMaybeScope()
  const { user } = useAuth()
  const realtimeHealth = useRealtimeHealth()
  const tabVisible = useDocumentVisibility()
  const placeholderData = useMemo(
    () => peekBusinessExpressOnrampStatus(user?.id) ?? undefined,
    [user?.id],
  )

  return useQuery({
    queryKey: scope ? qk.verification.expressOnramp(scope) : ["verification", "express-onramp", "disabled"],
    queryFn: () => fetchBusinessExpressOnrampStatus(true, user?.id),
    enabled: Boolean(scope),
    placeholderData,
    staleTime: STALE_MS,
    gcTime: 30 * 60_000,
    refetchOnMount: "always",
    refetchOnWindowFocus: (query) =>
      expressNeedsLiveUpdates(query.state.data as BusinessExpressOnrampStatus | undefined),
    refetchInterval: (query) => {
      if (!tabVisible) return false
      if (!expressNeedsLiveUpdates(query.state.data as BusinessExpressOnrampStatus | undefined)) return false
      if (isChannelHealthy(realtimeHealth)) return 30_000
      return pollingIntervalFor("operational", realtimeHealth)
    },
    meta: { safePersist: true, webPersist: "reduced", freshness: "operational" },
  })
}

export async function prefetchExpressOnrampStatus(queryClient: QueryClient, scope: Scope, userId?: string | null) {
  await queryClient.prefetchQuery(expressOnrampStatusQueryOptions(scope, userId))
}

export function usePrimeExpressOnrampStatus(enabled: boolean) {
  const queryClient = useQueryClient()
  const scope = useMaybeScope()
  const { user } = useAuth()
  useEffect(() => {
    if (!enabled || !scope) return
    void queryClient.prefetchQuery(expressOnrampStatusQueryOptions(scope, user?.id))
  }, [enabled, queryClient, scope, user?.id])
}
