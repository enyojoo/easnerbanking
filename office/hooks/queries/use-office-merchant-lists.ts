"use client"

import { useQuery } from "@tanstack/react-query"
import { officeFetch } from "@/lib/api-client"
import { officeKeys } from "@/lib/query/keys"
import { officeOperationalQueryDefaults } from "./query-options"
import { useOfficeAdminEnabled } from "./use-office-admin-enabled"

export function useOfficeBusinesses() {
  const { enabled } = useOfficeAdminEnabled()

  return useQuery({
    queryKey: officeKeys.businesses(),
    enabled,
    ...officeOperationalQueryDefaults,
    queryFn: async () => {
      const r = await officeFetch("/api/admin/business/businesses")
      const body = (await r.json()) as { businesses?: unknown[]; error?: string }
      if (!r.ok || body.error) {
        throw new Error(typeof body.error === "string" ? body.error : "Failed to load businesses")
      }
      return body.businesses ?? []
    },
  })
}

export function useOfficeCustomers() {
  const { enabled } = useOfficeAdminEnabled()

  return useQuery({
    queryKey: officeKeys.businessCustomers(),
    enabled,
    ...officeOperationalQueryDefaults,
    queryFn: async () => {
      const r = await officeFetch("/api/admin/business/customers")
      const body = (await r.json()) as { customers?: unknown[]; error?: string }
      if (!r.ok || body.error) {
        throw new Error(typeof body.error === "string" ? body.error : "Failed to load customers")
      }
      return body.customers ?? []
    },
  })
}

export function useOfficeInvoices() {
  const { enabled } = useOfficeAdminEnabled()

  return useQuery({
    queryKey: officeKeys.businessInvoices(),
    enabled,
    ...officeOperationalQueryDefaults,
    queryFn: async () => {
      const r = await officeFetch("/api/admin/business/invoices")
      const body = (await r.json()) as { invoices?: unknown[]; error?: string }
      if (!r.ok || body.error) {
        throw new Error(typeof body.error === "string" ? body.error : "Failed to load invoices")
      }
      return body.invoices ?? []
    },
  })
}

export function useOfficeTerminalSessions() {
  const { enabled } = useOfficeAdminEnabled()

  return useQuery({
    queryKey: officeKeys.terminalSessions(),
    enabled,
    ...officeOperationalQueryDefaults,
    queryFn: async () => {
      const r = await officeFetch("/api/admin/business/terminal-sessions")
      const body = (await r.json()) as { sessions?: unknown[]; error?: string }
      if (!r.ok || body.error) {
        throw new Error(typeof body.error === "string" ? body.error : "Failed to load terminal sessions")
      }
      return body.sessions ?? []
    },
  })
}
