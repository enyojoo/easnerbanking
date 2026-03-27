"use client"

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  type ReactNode,
} from "react"
import { mockCustomers, type Customer } from "@/lib/mock-data"

interface CustomersContextValue {
  customers: Customer[]
  addCustomer: (customer: Customer) => void
  updateCustomer: (id: string, updates: Partial<Customer>) => void
  deleteCustomer: (id: string) => void
}

const CustomersContext = createContext<CustomersContextValue | null>(null)

export function CustomersProvider({ children }: { children: ReactNode }) {
  const [customers, setCustomers] = useState<Customer[]>(mockCustomers)

  useEffect(() => {
    let cancelled = false
    fetch("/api/b2b/demo")
      .then((r) => r.json())
      .then((d: { customers?: Customer[] }) => {
        if (cancelled || !d.customers?.length) return
        setCustomers((prev) => {
          const byId = new Map(prev.map((c) => [c.id, c]))
          for (const c of d.customers!) {
            byId.set(c.id, c)
          }
          return Array.from(byId.values())
        })
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  const addCustomer = useCallback((customer: Customer) => {
    setCustomers((prev) => [customer, ...prev])
  }, [])

  const updateCustomer = useCallback((id: string, updates: Partial<Customer>) => {
    setCustomers((prev) =>
      prev.map((c) => (c.id === id ? { ...c, ...updates } : c))
    )
  }, [])

  const deleteCustomer = useCallback((id: string) => {
    setCustomers((prev) => prev.filter((c) => c.id !== id))
  }, [])

  return (
    <CustomersContext.Provider
      value={{ customers, addCustomer, updateCustomer, deleteCustomer }}
    >
      {children}
    </CustomersContext.Provider>
  )
}

export function useCustomers() {
  const ctx = useContext(CustomersContext)
  if (!ctx) {
    throw new Error("useCustomers must be used within CustomersProvider")
  }
  return ctx
}
