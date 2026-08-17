"use client"

import { useEffect } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { qk, type QueryFilters } from "@easner/shared"
import { apiFetch } from "@/lib/query/api-client"
import { useScope } from "@/lib/query/scope"
import { useDocumentVisibility } from "@/lib/query/use-document-visibility"
import type { Invoice } from "@/lib/b2b/types"
import {
  INVOICES_DETAIL_STALE_MS,
  INVOICES_LIST_POLL_MS,
  INVOICES_LIST_STALE_MS,
  syncInvoiceToListCaches,
} from "@/lib/invoices/invoice-query-cache"

/**
 * B2B invoices for the active scope.
 *
 * Status is operational data (Stripe webhooks, cron past-due, email sends).
 * Mutations patch the cache optimistically; detail fetches sync back to list
 * rows; polling + refetch-on-mount keep cross-page navigation fresh.
 */
export function useInvoicesList(filters: QueryFilters = {}) {
  const { scope } = useScope()
  const tabVisible = useDocumentVisibility()
  return useQuery({
    queryKey: scope ? qk.invoices.list(scope, filters) : ["invoices", "disabled"],
    enabled: Boolean(scope),
    queryFn: () =>
      apiFetch<{ invoices: Invoice[] }>("/api/business/b2b/invoices", { query: filters }),
    staleTime: INVOICES_LIST_STALE_MS,
    gcTime: 30 * 60_000,
    refetchOnMount: true,
    refetchInterval: tabVisible ? INVOICES_LIST_POLL_MS : false,
    refetchIntervalInBackground: false,
    select: (d) => d.invoices ?? [],
    meta: { safePersist: true, webPersist: "reduced", freshness: "operational" },
  })
}

export function useInvoiceDetail(invoiceId: string | null) {
  const { scope } = useScope()
  const queryClient = useQueryClient()

  const query = useQuery({
    queryKey: scope && invoiceId
      ? qk.invoices.detail(scope, invoiceId)
      : ["invoices", "detail", "disabled"],
    enabled: Boolean(scope) && Boolean(invoiceId),
    queryFn: () => apiFetch<Invoice>(`/api/business/b2b/invoices/${invoiceId}`),
    staleTime: INVOICES_DETAIL_STALE_MS,
    gcTime: 30 * 60_000,
    refetchOnMount: true,
    // Prefer the live list row so status changes on /invoices show instantly on detail open.
    placeholderData: () => {
      if (!scope || !invoiceId) return undefined
      const envelope = queryClient.getQueryData<{ invoices: Invoice[] }>(
        qk.invoices.list(scope, {}),
      )
      return envelope?.invoices?.find((inv) => inv.id === invoiceId)
    },
    meta: { safePersist: true, webPersist: "none", freshness: "operational" },
  })

  // Detail GETs can be fresher than the list (webhooks, send-email). Push status back to list caches.
  useEffect(() => {
    if (!scope || !invoiceId || !query.data || query.isPlaceholderData) return
    syncInvoiceToListCaches(queryClient, scope, query.data)
  }, [scope, invoiceId, query.data, query.isPlaceholderData, queryClient])

  return query
}

export function getInvoiceDetailPrefetchOptions(scope: NonNullable<ReturnType<typeof useScope>["scope"]>, invoiceId: string) {
  return {
    queryKey: qk.invoices.detail(scope, invoiceId),
    queryFn: () => apiFetch<Invoice>(`/api/business/b2b/invoices/${invoiceId}`),
    staleTime: INVOICES_DETAIL_STALE_MS,
    gcTime: 30 * 60_000,
    meta: { safePersist: true, webPersist: "none", freshness: "operational" as const },
  }
}
