"use client"

import { useQuery } from "@tanstack/react-query"
import { qk, type QueryFilters } from "@easner/shared"
import { apiFetch } from "@/lib/query/api-client"
import { useScope } from "@/lib/query/scope"
import type { Invoice } from "@/lib/b2b/types"

/**
 * B2B invoices for the active scope.
 *
 * Replaces the hand-rolled `InvoicesProvider` (which keyed a per-user
 * `localStorage` cache via `useCachedData` + `CACHE_KEYS.B2B_INVOICES`).
 * Staleness is 60s; most invoice mutations update the cache directly
 * via `setQueryData` so we don't refetch the full list on create/edit.
 */
export function useInvoicesList(filters: QueryFilters = {}) {
  const { scope } = useScope()
  return useQuery({
    queryKey: scope ? qk.invoices.list(scope, filters) : ["invoices", "disabled"],
    enabled: Boolean(scope),
    queryFn: () =>
      apiFetch<{ invoices: Invoice[] }>("/api/business/b2b/invoices", { query: filters }),
    staleTime: 60_000,
    gcTime: 30 * 60_000,
    select: (d) => d.invoices ?? [],
    meta: { safePersist: true, freshness: "operational" },
  })
}

export function useInvoiceDetail(invoiceId: string | null) {
  const { scope } = useScope()
  return useQuery({
    queryKey: scope && invoiceId
      ? qk.invoices.detail(scope, invoiceId)
      : ["invoices", "detail", "disabled"],
    enabled: Boolean(scope) && Boolean(invoiceId),
    queryFn: () => apiFetch<Invoice>(`/api/business/b2b/invoices/${invoiceId}`),
    staleTime: 60_000,
    gcTime: 30 * 60_000,
    meta: { safePersist: true, freshness: "operational" },
  })
}
