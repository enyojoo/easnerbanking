"use client"

import { useInfiniteQuery } from "@tanstack/react-query"
import { pollingIntervalFor } from "@easner/shared"
import { officeFetch } from "@/lib/api-client"
import type { OfficeTransaction, OfficeTransactionsSummary } from "@/lib/types/office-transaction"
import { officeKeys, type OfficeTransactionFilters } from "@/lib/query/keys"
import { useDocumentVisibility } from "@/lib/query/use-document-visibility"
import { useOfficeRealtimeHealth } from "@/lib/query/attach-office-realtime-bridge"
import { OFFICE_TRANSACTIONS_PAGE_SIZE } from "./constants"
import { officeOperationalQueryDefaults } from "./query-options"
import { useOfficeAdminEnabled } from "./use-office-admin-enabled"

export type OfficeTransactionsPage = {
  transactions: OfficeTransaction[]
  summary: OfficeTransactionsSummary
  nextCursor: string | null
}

function buildTransactionsUrl(filters: OfficeTransactionFilters, cursor?: string | null): string {
  const params = new URLSearchParams({ limit: String(OFFICE_TRANSACTIONS_PAGE_SIZE) })
  if (filters.provider && filters.provider !== "all") params.set("provider", filters.provider)
  if (filters.ycMode && filters.ycMode !== "all") params.set("ycMode", filters.ycMode)
  if (filters.rail && filters.rail !== "all") params.set("rail", filters.rail)
  if (filters.status && filters.status !== "all") params.set("status", filters.status)
  if (cursor) params.set("cursor", cursor)
  return `/api/admin/office/transactions?${params.toString()}`
}

export function useOfficeTransactionsList(filters: OfficeTransactionFilters = {}) {
  const { enabled } = useOfficeAdminEnabled()
  const realtimeHealth = useOfficeRealtimeHealth()
  const tabVisible = useDocumentVisibility()

  return useInfiniteQuery({
    queryKey: officeKeys.transactions(filters),
    enabled,
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam }): Promise<OfficeTransactionsPage> => {
      const r = await officeFetch(buildTransactionsUrl(filters, pageParam))
      const body = (await r.json()) as {
        transactions?: OfficeTransaction[]
        summary?: OfficeTransactionsSummary
        nextCursor?: string | null
        error?: string
      }
      if (!r.ok || body.error) {
        throw new Error(typeof body.error === "string" ? body.error : r.statusText || "Failed to load transactions")
      }
      const transactions = (body.transactions ?? []).map((t) => ({
        ...t,
        id: String(t.id || ""),
        status: String(t.status || "pending"),
        created_at: String(t.created_at || ""),
      }))
      const summary = body.summary ?? {
        volumeBalance: {
          USD: { moneyIn: 0, moneyOut: 0, total: 0 },
          EUR: { moneyIn: 0, moneyOut: 0, total: 0 },
        },
        transactionCount: transactions.length,
      }
      return { transactions, summary, nextCursor: body.nextCursor ?? null }
    },
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    ...officeOperationalQueryDefaults,
    refetchInterval: tabVisible ? pollingIntervalFor("operational", realtimeHealth) : false,
  })
}
