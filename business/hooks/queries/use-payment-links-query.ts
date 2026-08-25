"use client"

import { useQuery, type QueryClient } from "@tanstack/react-query"
import { pollingIntervalFor, qk, type QueryFilters, type Scope } from "@easner/shared"
import { apiFetch } from "@/lib/query/api-client"
import { useScope } from "@/lib/query/scope"
import { useRealtimeHealth } from "@/lib/query/realtime-health-context"
import { useDocumentVisibility } from "@/lib/query/use-document-visibility"
import type { PaymentLink } from "@/lib/payment-links/types"

export type PaymentLinksListPayload = {
  links: Array<PaymentLink & { url: string }>
  easetag: string | null
}

const STALE_MS = 15_000

export function paymentLinksListQueryOptions(scope: Scope, includeArchived = false) {
  const filters: QueryFilters = { archived: includeArchived }
  return {
    queryKey: qk.collections.paymentLinks.list(scope, filters),
    queryFn: () =>
      apiFetch<PaymentLinksListPayload>("/api/payment-links", {
        query: includeArchived ? { archived: "true" } : undefined,
      }),
    staleTime: STALE_MS,
    gcTime: 30 * 60_000,
    meta: { safePersist: true, webPersist: "reduced" as const, freshness: "operational" as const },
  }
}

export function usePaymentLinksQuery(options?: { includeArchived?: boolean }) {
  const includeArchived = options?.includeArchived ?? false
  const { scope } = useScope()
  const realtimeHealth = useRealtimeHealth()
  const tabVisible = useDocumentVisibility()
  const filters: QueryFilters = { archived: includeArchived }
  return useQuery<PaymentLinksListPayload>({
    queryKey: scope
      ? qk.collections.paymentLinks.list(scope, filters)
      : ["collections", "payment-links", "disabled"],
    queryFn: () =>
      apiFetch<PaymentLinksListPayload>("/api/payment-links", {
        query: includeArchived ? { archived: "true" } : undefined,
      }),
    enabled: Boolean(scope),
    staleTime: STALE_MS,
    gcTime: 30 * 60_000,
    // Cache-first: `payment_links` realtime + gated polling + focus keep this
    // fresh; the forced mount refetch predated that coverage.
    refetchOnWindowFocus: true,
    refetchInterval: tabVisible ? pollingIntervalFor("operational", realtimeHealth) : false,
    refetchIntervalInBackground: false,
    meta: { safePersist: true, webPersist: "reduced", freshness: "operational" },
  })
}

export async function prefetchPaymentLinks(queryClient: QueryClient, scope: Scope) {
  await queryClient.prefetchQuery(paymentLinksListQueryOptions(scope, true))
}
