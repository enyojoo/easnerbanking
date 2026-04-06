"use client"

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useRef,
  type ReactNode,
} from "react"
import type { Invoice } from "@/lib/b2b/types"
import { CACHE_KEYS, dataCache } from "@/lib/cache"
import { useAuth } from "@/lib/auth-context"
import { fetchWithSession } from "@/lib/fetch-with-session"
import { useCachedData } from "@/lib/use-cached-data"
import {
  addInvoiceToStore,
  updateInvoiceInStore,
  removeInvoiceFromStore,
  replaceInvoiceStore,
} from "@/lib/invoice-store"

const B2B_INVOICES_CACHE_TTL_MS = 60 * 60 * 1000

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
  const { user, isLoading: authLoading } = useAuth()
  const [error, setError] = useState<string | null>(null)
  const invoicesRef = useRef<Invoice[]>([])

  const fetchInvoices = useCallback(async () => {
    const res = await fetchWithSession("/api/business/b2b/invoices")
    const data = (await res.json().catch(() => ({}))) as {
      invoices?: Invoice[]
      error?: string
    }
    if (!res.ok) {
      throw new Error(data.error || "Failed to load invoices")
    }
    return data.invoices ?? []
  }, [])

  const onLoadError = useCallback((e: unknown) => {
    setError(e instanceof Error ? e.message : "Failed to load invoices")
    replaceInvoiceStore([])
  }, [])

  const {
    data: invoices,
    setData: setInvoices,
    loading,
    refetch,
  } = useCachedData<Invoice[]>({
    enabled: !authLoading && Boolean(user?.id),
    cacheKey: user?.id ? CACHE_KEYS.B2B_INVOICES(user.id) : null,
    persistKey: user?.id ? `easner_b2b_invoices_${user.id}` : undefined,
    initialData: [],
    ttlMs: B2B_INVOICES_CACHE_TTL_MS,
    fetcher: fetchInvoices,
    onError: onLoadError,
  })

  useEffect(() => {
    invoicesRef.current = invoices
    replaceInvoiceStore(invoices)
  }, [invoices])

  const refreshInvoices = useCallback(async () => {
    setError(null)
    await refetch()
  }, [refetch])

  const addInvoice = useCallback(
    async (invoice: Invoice) => {
      setError(null)
      const res = await fetchWithSession("/api/business/b2b/invoices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(invoice),
      })
      const data = (await res.json().catch(() => ({}))) as {
        invoice?: Invoice
        error?: string
      }
      if (!res.ok) {
        setError(data.error || "Failed to create invoice")
        return null
      }
      const created = data.invoice
      if (created) {
        addInvoiceToStore(created)
        setInvoices((prev) => [created, ...prev.filter((i) => i.id !== created.id)])
      }
      return created ?? null
    },
    [setInvoices],
  )

  const updateInvoice = useCallback(
    async (id: string, updates: Partial<Invoice>) => {
      setError(null)
      const prev = invoicesRef.current.find((i) => i.id === id)
      const merged = prev ? { ...prev, ...updates, id } : ({ ...updates, id } as Invoice)
      const res = await fetchWithSession(`/api/business/b2b/invoices/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(merged),
      })
      const data = (await res.json().catch(() => ({}))) as {
        invoice?: Invoice
        error?: string
      }
      if (!res.ok) {
        setError(data.error || "Failed to update invoice")
        return null
      }
      const updated = data.invoice
      if (updated) {
        updateInvoiceInStore(id, updated)
        setInvoices((prev) => prev.map((i) => (i.id === id ? updated : i)))
      }
      return updated ?? null
    },
    [setInvoices],
  )

  const deleteInvoice = useCallback(
    async (id: string) => {
      setError(null)
      const res = await fetchWithSession(
        `/api/business/b2b/invoices/${encodeURIComponent(id)}`,
        { method: "DELETE" },
      )
      const data = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) {
        setError(data.error || "Failed to delete invoice")
        return false
      }
      removeInvoiceFromStore(id)
      setInvoices((prev) => prev.filter((i) => i.id !== id))
      return true
    },
    [setInvoices],
  )

  return (
    <InvoicesContext.Provider
      value={{
        invoices,
        loading,
        error,
        refreshInvoices,
        addInvoice,
        updateInvoice,
        deleteInvoice,
      }}
    >
      {children}
    </InvoicesContext.Provider>
  )
}

export function invalidateB2bInvoicesCache(userId: string) {
  dataCache.invalidate(CACHE_KEYS.B2B_INVOICES(userId))
}

export function useInvoices() {
  const ctx = useContext(InvoicesContext)
  if (!ctx) {
    throw new Error("useInvoices must be used within InvoicesProvider")
  }
  return ctx
}
