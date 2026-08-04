"use client"

import { useMutation, useQueryClient } from "@tanstack/react-query"
import { qk } from "@easner/shared"
import { apiFetch } from "@/lib/query/api-client"
import { useScope } from "@/lib/query/scope"
import type { Invoice } from "@/lib/b2b/types"
import {
  addInvoiceToStore,
  removeInvoiceFromStore,
  updateInvoiceInStore,
} from "@/lib/invoice-store"

type InvoicesListEnvelope = { invoices: Invoice[] }

function patchList(
  qc: ReturnType<typeof useQueryClient>,
  listKey: readonly unknown[],
  patch: (prev: Invoice[]) => Invoice[],
) {
  qc.setQueryData<InvoicesListEnvelope>(listKey as never, (prev) => {
    if (!prev) return prev
    return { ...prev, invoices: patch(prev.invoices ?? []) }
  })
}

/** Optimistic add: prepends the invoice locally, reconciles on response. */
export function useAddInvoice() {
  const qc = useQueryClient()
  const { scope } = useScope()
  return useMutation({
    meta: { intent: "create invoice", destructive: false },
    mutationFn: (invoice: Invoice) =>
      apiFetch<{ invoice: Invoice }>("/api/business/b2b/invoices", {
        method: "POST",
        body: invoice,
      }),
    onMutate: async (invoice) => {
      if (!scope) return {}
      const listKey = qk.invoices.list(scope, {})
      await qc.cancelQueries({ queryKey: listKey })
      const prev = qc.getQueryData<InvoicesListEnvelope>(listKey)
      patchList(qc, listKey, (rows) => [invoice, ...rows.filter((i) => i.id !== invoice.id)])
      return { prev }
    },
    onError: (_err, _invoice, ctx) => {
      if (!scope) return
      if (ctx?.prev) qc.setQueryData(qk.invoices.list(scope, {}), ctx.prev)
    },
    onSuccess: (data, invoice) => {
      if (!scope) return
      const created = data.invoice
      if (!created) return
      addInvoiceToStore(created)
      patchList(qc, qk.invoices.list(scope, {}), (rows) => [
        created,
        ...rows.filter((i) => i.id !== created.id && i.id !== invoice.id),
      ])
      qc.setQueryData(qk.invoices.detail(scope, created.id), created)
    },
  })
}

/** Optimistic update by id. */
export function useUpdateInvoice() {
  const qc = useQueryClient()
  const { scope } = useScope()
  return useMutation({
    meta: { intent: "update invoice", destructive: false },
    mutationFn: ({ id, updates }: { id: string; updates: Partial<Invoice> }) =>
      apiFetch<{ invoice: Invoice }>(`/api/business/b2b/invoices/${encodeURIComponent(id)}`, {
        method: "PATCH",
        body: { id, ...updates },
      }),
    onMutate: async ({ id, updates }) => {
      if (!scope) return {}
      const listKey = qk.invoices.list(scope, {})
      const detailKey = qk.invoices.detail(scope, id)
      await qc.cancelQueries({ queryKey: listKey })
      const prev = qc.getQueryData<InvoicesListEnvelope>(listKey)
      const prevDetail = qc.getQueryData<Invoice>(detailKey)
      patchList(qc, listKey, (rows) =>
        rows.map((i) => (i.id === id ? ({ ...i, ...updates, id } as Invoice) : i)),
      )
      if (prevDetail) {
        qc.setQueryData(detailKey, { ...prevDetail, ...updates, id } as Invoice)
      }
      return { prev, prevDetail }
    },
    onError: (_err, variables, ctx) => {
      if (!scope) return
      if (ctx?.prev) qc.setQueryData(qk.invoices.list(scope, {}), ctx.prev)
      if (ctx?.prevDetail !== undefined && variables) {
        qc.setQueryData(qk.invoices.detail(scope, variables.id), ctx.prevDetail)
      }
    },
    onSuccess: (data, { id }) => {
      if (!scope) return
      const updated = data.invoice
      if (!updated) return
      updateInvoiceInStore(id, updated)
      // Patch list in place — avoid invalidating the full invoices query.
      patchList(qc, qk.invoices.list(scope, {}), (rows) =>
        rows.map((i) => (i.id === id ? updated : i)),
      )
      qc.setQueryData(qk.invoices.detail(scope, id), updated)
    },
  })
}

/** Optimistic delete. Rolls back if the server refuses. */
export function useDeleteInvoice() {
  const qc = useQueryClient()
  const { scope } = useScope()
  return useMutation({
    meta: { intent: "delete invoice", destructive: true },
    mutationFn: (id: string) =>
      apiFetch<{ ok: true }>(`/api/business/b2b/invoices/${encodeURIComponent(id)}`, {
        method: "DELETE",
      }),
    onMutate: async (id) => {
      if (!scope) return {}
      const listKey = qk.invoices.list(scope, {})
      await qc.cancelQueries({ queryKey: listKey })
      const prev = qc.getQueryData<InvoicesListEnvelope>(listKey)
      patchList(qc, listKey, (rows) => rows.filter((i) => i.id !== id))
      return { prev }
    },
    onError: (_err, _id, ctx) => {
      if (!scope) return
      if (ctx?.prev) qc.setQueryData(qk.invoices.list(scope, {}), ctx.prev)
    },
    onSuccess: (_data, id) => {
      if (scope) qc.removeQueries({ queryKey: qk.invoices.detail(scope, id) })
      removeInvoiceFromStore(id)
    },
  })
}
