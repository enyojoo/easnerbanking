"use client"

import { useInfiniteQuery } from "@tanstack/react-query"
import { officeFetch } from "@/lib/api-client"
import { officeKeys } from "@/lib/query/keys"
import type { OfficeStatement, OfficeStatementsPage } from "@/lib/types/office-statement"
import { useOfficeRealtimeRefetchInterval } from "@/lib/query/attach-office-realtime-bridge"
import { OFFICE_TRANSACTIONS_PAGE_SIZE } from "./constants"
import { officeOperationalQueryDefaults } from "./query-options"
import { useOfficeAdminEnabled } from "./use-office-admin-enabled"

export type OfficeStatementFilters = {
  q?: string
  currency?: string
  scope?: string
}

function buildStatementsUrl(filters: OfficeStatementFilters, cursor?: string | null): string {
  const params = new URLSearchParams({ limit: String(OFFICE_TRANSACTIONS_PAGE_SIZE) })
  if (filters.q?.trim()) params.set("q", filters.q.trim())
  if (filters.currency && filters.currency !== "all") params.set("currency", filters.currency)
  if (filters.scope && filters.scope !== "all") params.set("scope", filters.scope)
  if (cursor) params.set("cursor", cursor)
  return `/api/admin/office/statements?${params.toString()}`
}

export async function fetchOfficeStatementsPage(
  filters: OfficeStatementFilters,
  cursor: string | null,
): Promise<OfficeStatementsPage> {
  const r = await officeFetch(buildStatementsUrl(filters, cursor))
  const body = (await r.json()) as OfficeStatementsPage & { error?: string }
  if (!r.ok || body.error) {
    throw new Error(typeof body.error === "string" ? body.error : r.statusText || "Failed to load statements")
  }
  const statements = (body.statements ?? []).map((row) => ({
    ...row,
    id: String(row.id || ""),
    statement_id: String(row.statement_id || ""),
    created_at: String(row.created_at || ""),
  }))
  return { statements, nextCursor: body.nextCursor ?? null }
}

export function officeStatementsInfiniteOptions(filters: OfficeStatementFilters = {}) {
  return {
    queryKey: officeKeys.statements(filters),
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }: { pageParam: string | null }) =>
      fetchOfficeStatementsPage(filters, pageParam),
    getNextPageParam: (lastPage: OfficeStatementsPage) => lastPage.nextCursor ?? undefined,
    ...officeOperationalQueryDefaults,
  }
}

export function useOfficeStatementsList(filters: OfficeStatementFilters = {}) {
  const { enabled } = useOfficeAdminEnabled()
  const refetchInterval = useOfficeRealtimeRefetchInterval("operational")

  return useInfiniteQuery({
    ...officeStatementsInfiniteOptions(filters),
    enabled,
    refetchInterval,
  })
}

export async function downloadOfficeStatement(statement: OfficeStatement): Promise<void> {
  const r = await officeFetch(`/api/admin/office/statements/${encodeURIComponent(statement.statement_id)}/download`)
  if (!r.ok) {
    const body = (await r.json().catch(() => ({}))) as { error?: string }
    throw new Error(typeof body.error === "string" ? body.error : "Download failed")
  }
  const blob = await r.blob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = `easner-statement-${statement.currency}-${statement.period_from}-${statement.period_to}.pdf`
  a.click()
  URL.revokeObjectURL(url)
}
