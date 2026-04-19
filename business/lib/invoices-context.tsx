"use client"

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { qk } from "@easner/shared"
import type { Invoice } from "@/lib/b2b/types"
import { useInvoicesList } from "@/hooks/queries/use-invoices"
import {
  useAddInvoice,
  useUpdateInvoice,
  useDeleteInvoice,
} from "@/hooks/mutations/use-invoices"
import { replaceInvoiceStore } from "@/lib/invoice-store"
import { useScope } from "@/lib/query/scope"

/**
 * Thin compat shim over the TanStack Query hooks.
 *
 * Public API (`useInvoices()` returning `{ invoices, loading, error,
 * refreshInvoices, addInvoice, updateInvoice, deleteInvoice }`) is
 * preserved so existing screens compile unchanged. Internally this
 * routes through `useInvoicesList` + optimistic mutation hooks, so
 * nothing touches `localStorage` or `dataCache` anymore for B2B
 * invoices — a concrete win on the "no sensitive data on disk" rule.
 */

interface InvoicesContextValue {
  invoices: Invoice[]
  loading: boolean
  error: string | null
  refreshInvoices: () => Promise<void>
  addInvoice: (invoice: Invoice) => Promise<Invoice | null>
  updateInvoice: (id: string, updates: Partial<Invoice>) => Promise<Invoice | null>
  deleteInvoice: (id: string) => Promise<boolean>
}

const InvoicesContext = createContext<InvoicesContextValue | null>(null)

export function InvoicesProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient()
  const { scope } = useScope()
  const [error, setError] = useState<string | null>(null)

  const query = useInvoicesList()
  const invoices = query.data ?? []
  const loading = query.isPending

  useEffect(() => {
    replaceInvoiceStore(invoices)
  }, [invoices])

  const refreshInvoices = useCallback(async () => {
    setError(null)
    if (!scope) return
    await qc.invalidateQueries({ queryKey: qk.invoices.list(scope, {}) })
  }, [qc, scope])

  const addMutation = useAddInvoice()
  const updateMutation = useUpdateInvoice()
  const deleteMutation = useDeleteInvoice()

  const addInvoice = useCallback(
    async (invoice: Invoice) => {
      setError(null)
      try {
        const res = await addMutation.mutateAsync(invoice)
        return res.invoice ?? null
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to create invoice")
        return null
      }
    },
    [addMutation],
  )

  const updateInvoice = useCallback(
    async (id: string, updates: Partial<Invoice>) => {
      setError(null)
      try {
        const res = await updateMutation.mutateAsync({ id, updates })
        return res.invoice ?? null
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to update invoice")
        return null
      }
    },
    [updateMutation],
  )

  const deleteInvoice = useCallback(
    async (id: string) => {
      setError(null)
      try {
        await deleteMutation.mutateAsync(id)
        return true
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to delete invoice")
        return false
      }
    },
    [deleteMutation],
  )

  const value = useMemo<InvoicesContextValue>(
    () => ({
      invoices,
      loading,
      error: error ?? (query.error instanceof Error ? query.error.message : null),
      refreshInvoices,
      addInvoice,
      updateInvoice,
      deleteInvoice,
    }),
    [invoices, loading, error, query.error, refreshInvoices, addInvoice, updateInvoice, deleteInvoice],
  )

  return <InvoicesContext.Provider value={value}>{children}</InvoicesContext.Provider>
}

/**
 * @deprecated No longer needed: TanStack Query owns invalidation.
 * Retained as a no-op so legacy call sites compile.
 */
export function invalidateB2bInvoicesCache(_userId: string) {
  // no-op
}

export function useInvoices() {
  const ctx = useContext(InvoicesContext)
  if (!ctx) {
    throw new Error("useInvoices must be used within InvoicesProvider")
  }
  return ctx
}
