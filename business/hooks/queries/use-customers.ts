"use client"

import { useQuery } from "@tanstack/react-query"
import { qk } from "@easner/shared"
import { apiFetch } from "@/lib/query/api-client"
import { useScope } from "@/lib/query/scope"
import type { Customer } from "@/lib/b2b/types"

export function useCustomersList() {
  const { scope } = useScope()
  return useQuery({
    queryKey: scope ? qk.customers.list(scope) : ["customers", "disabled"],
    enabled: Boolean(scope),
    queryFn: () => apiFetch<{ customers: Customer[] }>("/api/business/customers"),
    // 5 min, not 60: customers have no realtime table, so staleTime is the
    // only path for a second device/team member's edits to converge.
    staleTime: 5 * 60_000,
    gcTime: 60 * 60_000,
    select: (d) => d.customers ?? [],
    meta: { safePersist: true, webPersist: "reduced", freshness: "operational" },
  })
}
