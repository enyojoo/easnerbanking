"use client"

import {
  createContext,
  useContext,
  useState,
  useCallback,
  type ReactNode,
} from "react"
import type { Customer } from "@/lib/b2b/types"
import { CACHE_KEYS, dataCache } from "@/lib/cache"
import { useAuth } from "@/lib/auth-context"
import { fetchWithSession } from "@/lib/fetch-with-session"
import { useCachedData } from "@/lib/use-cached-data"

const BUSINESS_CUSTOMERS_CACHE_TTL_MS = 60 * 60 * 1000

interface CustomersContextValue {
  customers: Customer[]
  loading: boolean
  error: string | null
  refreshCustomers: () => Promise<void>
  addCustomer: (customer: Customer) => Promise<Customer | null>
  updateCustomer: (id: string, updates: Partial<Customer>) => Promise<Customer | null>
  deleteCustomer: (id: string) => Promise<boolean>
}

const CustomersContext = createContext<CustomersContextValue | null>(null)

export function CustomersProvider({ children }: { children: ReactNode }) {
  const { user, isLoading: authLoading } = useAuth()
  const [error, setError] = useState<string | null>(null)

  const fetchCustomers = useCallback(async () => {
    const res = await fetchWithSession("/api/business/customers")
    const data = (await res.json().catch(() => ({}))) as {
      customers?: Customer[]
      error?: string
    }
    if (!res.ok) {
      throw new Error(data.error || "Failed to load customers")
    }
    return data.customers ?? []
  }, [])

  const onLoadError = useCallback((e: unknown) => {
    setError(e instanceof Error ? e.message : "Failed to load customers")
  }, [])

  const {
    data: customers,
    setData: setCustomers,
    loading,
    refetch,
  } = useCachedData<Customer[]>({
    enabled: !authLoading && Boolean(user?.id),
    cacheKey: user?.id ? CACHE_KEYS.BUSINESS_CUSTOMERS(user.id) : null,
    persistKey: user?.id ? `easner_business_customers_${user.id}` : undefined,
    initialData: [],
    ttlMs: BUSINESS_CUSTOMERS_CACHE_TTL_MS,
    fetcher: fetchCustomers,
    onError: onLoadError,
  })

  const refreshCustomers = useCallback(async () => {
    setError(null)
    await refetch()
  }, [refetch])

  const addCustomer = useCallback(
    async (customer: Customer) => {
      setError(null)
      const res = await fetchWithSession("/api/business/customers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: customer.name,
          email: customer.email,
          phone: customer.phone,
          company: customer.company,
          address: customer.address,
          currency: customer.currency,
          status: customer.status,
        }),
      })
      const data = (await res.json().catch(() => ({}))) as {
        customer?: Customer
        error?: string
      }
      if (!res.ok) {
        setError(data.error || "Failed to create customer")
        return null
      }
      const created = data.customer
      if (created) {
        setCustomers((prev) => [created, ...prev.filter((c) => c.id !== created.id)])
      }
      return created ?? null
    },
    [setCustomers],
  )

  const updateCustomer = useCallback(
    async (id: string, updates: Partial<Customer>) => {
      setError(null)
      const res = await fetchWithSession(`/api/business/customers/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: updates.name,
          phone: updates.phone,
          company: updates.company,
          address: updates.address,
          currency: updates.currency,
          status: updates.status,
        }),
      })
      const data = (await res.json().catch(() => ({}))) as {
        customer?: Customer
        error?: string
      }
      if (!res.ok) {
        setError(data.error || "Failed to update customer")
        return null
      }
      const updated = data.customer
      if (updated) {
        setCustomers((prev) => prev.map((c) => (c.id === id ? updated : c)))
      }
      return updated ?? null
    },
    [setCustomers],
  )

  const deleteCustomer = useCallback(
    async (id: string) => {
      setError(null)
      const res = await fetchWithSession(
        `/api/business/customers/${encodeURIComponent(id)}`,
        { method: "DELETE" },
      )
      const data = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) {
        setError(data.error || "Failed to delete customer")
        return false
      }
      setCustomers((prev) => prev.filter((c) => c.id !== id))
      return true
    },
    [setCustomers],
  )

  return (
    <CustomersContext.Provider
      value={{
        customers,
        loading,
        error,
        refreshCustomers,
        addCustomer,
        updateCustomer,
        deleteCustomer,
      }}
    >
      {children}
    </CustomersContext.Provider>
  )
}

/** Invalidate cached business customers for a user (e.g. after org switch). */
export function invalidateBusinessCustomersCache(userId: string) {
  dataCache.invalidate(CACHE_KEYS.BUSINESS_CUSTOMERS(userId))
}

export function useCustomers() {
  const ctx = useContext(CustomersContext)
  if (!ctx) {
    throw new Error("useCustomers must be used within CustomersProvider")
  }
  return ctx
}
