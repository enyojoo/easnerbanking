"use client"

import { useQuery } from "@tanstack/react-query"
import { qk } from "@easner/shared"
import { apiFetch } from "@/lib/query/api-client"
import { useScope } from "@/lib/query/scope"
import type { CheckoutTestPayment } from "@/lib/checkout/hub-types"

export type CheckoutTestPaymentsPayload = {
  payments: CheckoutTestPayment[]
}

const STALE_MS = 0

export function useCheckoutTestPaymentsQuery(enabled: boolean) {
  const { scope } = useScope()
  return useQuery<CheckoutTestPaymentsPayload>({
    queryKey: scope
      ? qk.collections.checkoutSettings.testPayments(scope)
      : ["collections", "checkout-settings", "test-payments", "disabled"],
    queryFn: () => apiFetch<CheckoutTestPaymentsPayload>("/api/checkout/test-payments"),
    enabled: enabled && Boolean(scope),
    staleTime: STALE_MS,
    gcTime: 30 * 60_000,
    refetchOnMount: "always",
    meta: { safePersist: true, webPersist: "reduced", freshness: "operational" },
  })
}
