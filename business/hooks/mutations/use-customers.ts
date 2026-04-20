"use client"

import { useMutation, useQueryClient } from "@tanstack/react-query"
import { qk } from "@easner/shared"
import { apiFetch } from "@/lib/query/api-client"
import { useScope } from "@/lib/query/scope"
import type { Customer } from "@/lib/b2b/types"

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

export function useAddCustomer() {
  const qc = useQueryClient()
  const { scope } = useScope()
  return useMutation({
    meta: { intent: "create customer", destructive: false },
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
    onError: (_err, _c, ctx) => {
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
}

export function useUpdateCustomer() {
  const qc = useQueryClient()
  const { scope } = useScope()
  return useMutation({
    meta: { intent: "update customer", destructive: false },
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
    onError: (_err, _i, ctx) => {
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
}

export function useDeleteCustomer() {
  const qc = useQueryClient()
  const { scope } = useScope()
  return useMutation({
    meta: { intent: "delete customer", destructive: true },
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
    onError: (_err, _id, ctx) => {
      if (scope && ctx?.prev) qc.setQueryData(qk.customers.list(scope), ctx.prev)
    },
  })
}
