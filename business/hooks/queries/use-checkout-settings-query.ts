"use client"

import { useQuery, type QueryClient } from "@tanstack/react-query"
import { qk, type Scope } from "@easner/shared"
import { apiFetch } from "@/lib/query/api-client"
import { useScope } from "@/lib/query/scope"
import type { CheckoutHubPayload } from "@/lib/checkout/hub-types"

const STALE_MS = 0

export function checkoutSettingsQueryOptions(scope: Scope) {
  return {
    queryKey: qk.collections.checkoutSettings.hub(scope),
    queryFn: () => apiFetch<CheckoutHubPayload>("/api/checkout/settings"),
    staleTime: STALE_MS,
    gcTime: 30 * 60_000,
    refetchOnMount: "always" as const,
    meta: { safePersist: true, webPersist: "reduced" as const, freshness: "critical" as const },
  }
}

export function useCheckoutSettingsQuery() {
  const { scope } = useScope()
  return useQuery<CheckoutHubPayload>({
    queryKey: scope
      ? qk.collections.checkoutSettings.hub(scope)
      : ["collections", "checkout-settings", "disabled"],
    queryFn: () => apiFetch<CheckoutHubPayload>("/api/checkout/settings"),
    enabled: Boolean(scope),
    staleTime: STALE_MS,
    gcTime: 30 * 60_000,
    refetchOnMount: "always",
    meta: { safePersist: true, webPersist: "reduced", freshness: "critical" },
  })
}

export async function prefetchCheckoutSettings(queryClient: QueryClient, scope: Scope) {
  await queryClient.prefetchQuery(checkoutSettingsQueryOptions(scope))
}
