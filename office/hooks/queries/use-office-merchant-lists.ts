"use client"

import { useQuery } from "@tanstack/react-query"
import { officeFetch } from "@/lib/api-client"
import { officeKeys } from "@/lib/query/keys"
import { useOfficeRealtimeRefetchInterval } from "@/lib/query/attach-office-realtime-bridge"
import { officeOperationalQueryDefaults } from "./query-options"
import { useOfficeAdminEnabled } from "./use-office-admin-enabled"

/** Pure fetchers shared by the hooks below and the boot-time primer. */
export async function fetchOfficeBusinesses(): Promise<unknown[]> {
  const r = await officeFetch("/api/admin/business/businesses")
  const body = (await r.json()) as { businesses?: unknown[]; error?: string }
  if (!r.ok || body.error) {
    throw new Error(typeof body.error === "string" ? body.error : "Failed to load businesses")
  }
  return body.businesses ?? []
}

export async function fetchOfficeCustomers(): Promise<unknown[]> {
  const r = await officeFetch("/api/admin/business/customers")
  const body = (await r.json()) as { customers?: unknown[]; error?: string }
  if (!r.ok || body.error) {
    throw new Error(typeof body.error === "string" ? body.error : "Failed to load customers")
  }
  return body.customers ?? []
}

export async function fetchOfficeInvoices(): Promise<unknown[]> {
  const r = await officeFetch("/api/admin/business/invoices")
  const body = (await r.json()) as { invoices?: unknown[]; error?: string }
  if (!r.ok || body.error) {
    throw new Error(typeof body.error === "string" ? body.error : "Failed to load invoices")
  }
  return body.invoices ?? []
}

export async function fetchOfficeTerminalSessions(): Promise<unknown[]> {
  const r = await officeFetch("/api/admin/business/terminal-sessions")
  const body = (await r.json()) as { sessions?: unknown[]; error?: string }
  if (!r.ok || body.error) {
    throw new Error(typeof body.error === "string" ? body.error : "Failed to load terminal sessions")
  }
  return body.sessions ?? []
}

/** Options consumed by both the hooks and `primeOfficeNav`. */
export function officeBusinessesQueryOptions() {
  return {
    queryKey: officeKeys.businesses(),
    queryFn: fetchOfficeBusinesses,
    ...officeOperationalQueryDefaults,
  }
}

export function officeCustomersQueryOptions() {
  return {
    queryKey: officeKeys.businessCustomers(),
    queryFn: fetchOfficeCustomers,
    ...officeOperationalQueryDefaults,
  }
}

export function officeInvoicesQueryOptions() {
  return {
    queryKey: officeKeys.businessInvoices(),
    queryFn: fetchOfficeInvoices,
    ...officeOperationalQueryDefaults,
  }
}

export function officeTerminalSessionsQueryOptions() {
  return {
    queryKey: officeKeys.terminalSessions(),
    queryFn: fetchOfficeTerminalSessions,
    ...officeOperationalQueryDefaults,
  }
}

export function useOfficeBusinesses() {
  const { enabled } = useOfficeAdminEnabled()
  const refetchInterval = useOfficeRealtimeRefetchInterval("operational")

  return useQuery({
    ...officeBusinessesQueryOptions(),
    enabled,
    refetchInterval,
  })
}

export function useOfficeCustomers() {
  const { enabled } = useOfficeAdminEnabled()
  const refetchInterval = useOfficeRealtimeRefetchInterval("operational")

  return useQuery({
    ...officeCustomersQueryOptions(),
    enabled,
    refetchInterval,
  })
}

export function useOfficeInvoices() {
  const { enabled } = useOfficeAdminEnabled()
  const refetchInterval = useOfficeRealtimeRefetchInterval("operational")

  return useQuery({
    ...officeInvoicesQueryOptions(),
    enabled,
    refetchInterval,
  })
}

export function useOfficeTerminalSessions() {
  const { enabled } = useOfficeAdminEnabled()
  const refetchInterval = useOfficeRealtimeRefetchInterval("operational")

  return useQuery({
    ...officeTerminalSessionsQueryOptions(),
    enabled,
    refetchInterval,
  })
}
