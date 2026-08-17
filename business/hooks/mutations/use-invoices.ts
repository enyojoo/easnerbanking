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
import {
  invalidateInvoiceQueries,
  patchAllInvoiceLists,
} from "@/lib/invoices/invoice-query-cache"

type InvoicesListEnvelope = { invoices: Invoice[] }

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
      await qc.cancelQueries({ queryKey: qk.invoices.root(scope) })
      const prev = qc.getQueryData<InvoicesListEnvelope>(qk.invoices.list(scope, {}))
      patchAllInvoiceLists(qc, scope, (rows) => [invoice, ...rows.filter((i) => i.id !== invoice.id)])
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
      patchAllInvoiceLists(qc, scope, (rows) => [
        created,
        ...rows.filter((i) => i.id !== created.id && i.id !== invoice.id),
      ])
      qc.setQueryData(qk.invoices.detail(scope, created.id), created)
    },
    onSettled: () => {
      if (!scope) return
      void invalidateInvoiceQueries(qc, scope)
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
      await qc.cancelQueries({ queryKey: qk.invoices.root(scope) })
      const prev = qc.getQueryData<InvoicesListEnvelope>(listKey)
      const prevDetail = qc.getQueryData<Invoice>(detailKey)
      const base = prevDetail ?? prev?.invoices?.find((i) => i.id === id)
      patchAllInvoiceLists(qc, scope, (rows) =>
        rows.map((i) => (i.id === id ? ({ ...i, ...updates, id } as Invoice) : i)),
      )
      if (base) {
        qc.setQueryData(detailKey, { ...base, ...updates, id } as Invoice)
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
    onSuccess: async (data, { id }) => {
      if (!scope) return
      const updated = data.invoice
      if (!updated) return
      // Drop any list/detail refetch that started during the PATCH so stale
      // GET responses cannot overwrite the just-saved status.
      await qc.cancelQueries({ queryKey: qk.invoices.root(scope) })
      updateInvoiceInStore(id, updated)
      patchAllInvoiceLists(qc, scope, (rows) => rows.map((i) => (i.id === id ? updated : i)))
      qc.setQueryData(qk.invoices.detail(scope, id), updated)
    },
    onSettled: () => {
      if (!scope) return
      void invalidateInvoiceQueries(qc, scope)
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
      await qc.cancelQueries({ queryKey: qk.invoices.root(scope) })
      const prev = qc.getQueryData<InvoicesListEnvelope>(qk.invoices.list(scope, {}))
      patchAllInvoiceLists(qc, scope, (rows) => rows.filter((i) => i.id !== id))
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
    onSettled: () => {
      if (!scope) return
      void invalidateInvoiceQueries(qc, scope)
    },
  })
}
