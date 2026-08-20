import type { QueryClient } from "@tanstack/react-query"
import { qk, type Scope } from "@easner/shared"
import type { Invoice } from "@/lib/b2b/types"

export const INVOICES_LIST_STALE_MS = 30_000
export const INVOICES_DETAIL_STALE_MS = 60_000
/** Invoices have no realtime channel – poll while the tab is visible. */
export const INVOICES_LIST_POLL_MS = 60_000

type InvoicesListEnvelope = { invoices: Invoice[] }

function listQueryFilter(scope: Scope) {
  return { queryKey: [...qk.invoices.root(scope), "list"] as const }
}

export function patchAllInvoiceLists(
  qc: QueryClient,
  scope: Scope,
  patch: (prev: Invoice[]) => Invoice[],
) {
  qc.setQueriesData<InvoicesListEnvelope>(listQueryFilter(scope), (prev) => {
    if (!prev) return prev
    return { ...prev, invoices: patch(prev.invoices ?? []) }
  })
}

/** Keep list tab counts/status badges aligned after a detail fetch or server-only change. */
export function syncInvoiceToListCaches(qc: QueryClient, scope: Scope, invoice: Invoice) {
  patchAllInvoiceLists(qc, scope, (rows) => {
    const idx = rows.findIndex((i) => i.id === invoice.id)
    if (idx === -1) return rows
    const next = [...rows]
    next[idx] = invoice
    return next
  })
}

export function invalidateInvoiceQueries(qc: QueryClient, scope: Scope) {
  return qc.invalidateQueries({ queryKey: qk.invoices.root(scope), refetchType: "active" })
}
