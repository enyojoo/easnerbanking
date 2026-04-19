"use client"

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { qk } from "@easner/shared"
import type { Customer } from "@/lib/b2b/types"
import { apiFetch } from "@/lib/query/api-client"
import { useCustomersList } from "@/hooks/queries/use-customers"
import { useScope } from "@/lib/query/scope"

/**
 * Thin compat shim over the TanStack Query hooks.
 *
 * Preserves the `useCustomers()` call surface (`{ customers, loading,
 * error, refreshCustomers, addCustomer, updateCustomer, deleteCustomer }`)
 * so existing screens don't need to change while we migrate. Under the
 * hood it's all `useQuery` + optimistic `useMutation`s — no more
 * `dataCache` / `useCachedData` / `localStorage` for customer data.
 */

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

type CustomersEnvelope = { customers: Customer[] }

function patchList(
  qc: ReturnType<typeof useQueryClient>,
  listKey: readonly unknown[],
  patch: (prev: Customer[]) => Customer[],
) {
  qc.setQueryData<CustomersEnvelope>(listKey as never, (prev) => {
    if (!prev) return prev
    return { ...prev, customers: patch(prev.customers ?? []) }
  })
}

export function CustomersProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient()
  const { scope } = useScope()
  const [error, setError] = useState<string | null>(null)

  const query = useCustomersList()
  const customers = query.data ?? []
  const loading = query.isPending

  const refreshCustomers = useCallback(async () => {
    setError(null)
    if (!scope) return
    await qc.invalidateQueries({ queryKey: qk.customers.list(scope) })
  }, [qc, scope])

  const addMutation = useMutation({
    mutationFn: (customer: Customer) =>
      apiFetch<{ customer: Customer }>("/api/business/customers", {
        method: "POST",
        body: {
          name: customer.name,
          email: customer.email,
          phone: customer.phone,
          company: customer.company,
          address: customer.address,
          currency: customer.currency,
          status: customer.status,
        },
      }),
    onMutate: async (customer) => {
      if (!scope) return {}
      const listKey = qk.customers.list(scope)
      await qc.cancelQueries({ queryKey: listKey })
      const prev = qc.getQueryData<CustomersEnvelope>(listKey)
      patchList(qc, listKey, (rows) => [customer, ...rows.filter((c) => c.id !== customer.id)])
      return { prev }
    },
    onError: (err, _c, ctx) => {
      setError(err instanceof Error ? err.message : "Failed to create customer")
      if (scope && ctx?.prev) qc.setQueryData(qk.customers.list(scope), ctx.prev)
    },
    onSuccess: (data, customer) => {
      if (!scope) return
      const created = data.customer
      if (!created) return
      patchList(qc, qk.customers.list(scope), (rows) => [
        created,
        ...rows.filter((c) => c.id !== created.id && c.id !== customer.id),
      ])
    },
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: Partial<Customer> }) =>
      apiFetch<{ customer: Customer }>(`/api/business/customers/${encodeURIComponent(id)}`, {
        method: "PATCH",
        body: {
          name: updates.name,
          phone: updates.phone,
          company: updates.company,
          address: updates.address,
          currency: updates.currency,
          status: updates.status,
        },
      }),
    onMutate: async ({ id, updates }) => {
      if (!scope) return {}
      const listKey = qk.customers.list(scope)
      await qc.cancelQueries({ queryKey: listKey })
      const prev = qc.getQueryData<CustomersEnvelope>(listKey)
      patchList(qc, listKey, (rows) =>
        rows.map((c) => (c.id === id ? ({ ...c, ...updates, id } as Customer) : c)),
      )
      return { prev }
    },
    onError: (err, _i, ctx) => {
      setError(err instanceof Error ? err.message : "Failed to update customer")
      if (scope && ctx?.prev) qc.setQueryData(qk.customers.list(scope), ctx.prev)
    },
    onSuccess: (data, { id }) => {
      if (!scope) return
      const updated = data.customer
      if (!updated) return
      patchList(qc, qk.customers.list(scope), (rows) =>
        rows.map((c) => (c.id === id ? updated : c)),
      )
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) =>
      apiFetch<{ ok: true }>(`/api/business/customers/${encodeURIComponent(id)}`, {
        method: "DELETE",
      }),
    onMutate: async (id) => {
      if (!scope) return {}
      const listKey = qk.customers.list(scope)
      await qc.cancelQueries({ queryKey: listKey })
      const prev = qc.getQueryData<CustomersEnvelope>(listKey)
      patchList(qc, listKey, (rows) => rows.filter((c) => c.id !== id))
      return { prev }
    },
    onError: (err, _id, ctx) => {
      setError(err instanceof Error ? err.message : "Failed to delete customer")
      if (scope && ctx?.prev) qc.setQueryData(qk.customers.list(scope), ctx.prev)
    },
  })

  const addCustomer = useCallback(
    async (customer: Customer) => {
      setError(null)
      try {
        const res = await addMutation.mutateAsync(customer)
        return res.customer ?? null
      } catch {
        return null
      }
    },
    [addMutation],
  )

  const updateCustomer = useCallback(
    async (id: string, updates: Partial<Customer>) => {
      setError(null)
      try {
        const res = await updateMutation.mutateAsync({ id, updates })
        return res.customer ?? null
      } catch {
        return null
      }
    },
    [updateMutation],
  )

  const deleteCustomer = useCallback(
    async (id: string) => {
      setError(null)
      try {
        await deleteMutation.mutateAsync(id)
        return true
      } catch {
        return false
      }
    },
    [deleteMutation],
  )

  const value = useMemo<CustomersContextValue>(
    () => ({
      customers,
      loading,
      error: error ?? (query.error instanceof Error ? query.error.message : null),
      refreshCustomers,
      addCustomer,
      updateCustomer,
      deleteCustomer,
    }),
    [customers, loading, error, query.error, refreshCustomers, addCustomer, updateCustomer, deleteCustomer],
  )

  return <CustomersContext.Provider value={value}>{children}</CustomersContext.Provider>
}

/**
 * @deprecated No longer needed: TanStack Query owns invalidation.
 * Kept as a no-op so legacy call sites compile. Remove once callers
 * move to `queryClient.invalidateQueries({ queryKey: qk.customers.root(scope) })`.
 */
export function invalidateBusinessCustomersCache(_userId: string) {
  // no-op
}

export function useCustomers() {
  const ctx = useContext(CustomersContext)
  if (!ctx) {
    throw new Error("useCustomers must be used within CustomersProvider")
  }
  return ctx
}
