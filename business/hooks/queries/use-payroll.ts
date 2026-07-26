"use client"

import { useMemo } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { qk } from "@easner/shared"
import { apiFetch } from "@/lib/query/api-client"
import { useScope } from "@/lib/query/scope"
import { toBeneficiary, type RecipientRow } from "@/lib/recipients-store"
import type {
  PayrollCapabilities,
  PayrollOverview,
  PayrollPerson,
  PayrollReceivingMethodSummary,
  PayrollRun,
  PayrollSchedule,
  PayrollSettings,
} from "@/lib/payroll/types"

export function usePayrollCapabilities() {
  const { scope } = useScope()
  return useQuery({
    queryKey: scope ? ["payroll", "capabilities", scope] : ["payroll", "capabilities", "disabled"],
    enabled: Boolean(scope),
    queryFn: () => apiFetch<{ capabilities: PayrollCapabilities }>("/api/business/payroll/capabilities"),
    select: (d) => d.capabilities,
    staleTime: 60_000,
    meta: { safePersist: false, webPersist: "none", freshness: "operational" },
  })
}

export function usePayrollPerson(personId: string | null) {
  const { scope } = useScope()
  const queryClient = useQueryClient()
  const listPlaceholder = useMemo(() => {
    if (!scope || !personId) return undefined
    const envelope = queryClient.getQueryData<{ people: PayrollPerson[] }>(qk.payroll.people.list(scope))
    const person = envelope?.people?.find((item) => item.id === personId)
    return person ? { person, paymentHistory: [] } : undefined
  }, [personId, queryClient, scope])
  return useQuery({
    queryKey: scope && personId ? qk.payroll.people.detail(scope, personId) : ["payroll", "person", "disabled"],
    enabled: Boolean(scope && personId),
    queryFn: () =>
      apiFetch<{
        person: PayrollPerson
        paymentHistory?: unknown[]
        connection?: {
          id: string
          status: string
          preferredMethod: PayrollReceivingMethodSummary | null
        } | null
      }>(`/api/business/payroll/people/${personId}`),
    placeholderData: listPlaceholder,
    staleTime: 5 * 60_000,
    gcTime: 60 * 60_000,
    meta: { safePersist: false, webPersist: "none", freshness: "operational" },
  })
}

export function usePayrollReceivingDestination(personId: string | null, recipientId: string | null | undefined) {
  const { scope } = useScope()
  return useQuery({
    queryKey:
      scope && personId && recipientId
        ? ["payroll", "person", scope, personId, "receiving-destination", recipientId]
        : ["payroll", "person", "receiving-destination", "disabled"],
    enabled: Boolean(scope && personId && recipientId),
    queryFn: () =>
      apiFetch<{ recipient: RecipientRow }>(`/api/business/payroll/people/${personId}/receiving-destination`),
    select: (data) => toBeneficiary(data.recipient),
    staleTime: 5 * 60_000,
    gcTime: 60 * 60_000,
    meta: { safePersist: false, webPersist: "none", freshness: "operational" },
  })
}

export function usePayrollOverview() {
  const { scope } = useScope()
  return useQuery({
    queryKey: scope ? qk.payroll.overview(scope) : ["payroll", "overview", "disabled"],
    enabled: Boolean(scope),
    queryFn: () => apiFetch<{ overview: PayrollOverview }>("/api/business/payroll/overview"),
    select: (d) => d.overview,
    staleTime: 5 * 60_000,
    gcTime: 60 * 60_000,
    meta: { safePersist: true, webPersist: "reduced", freshness: "operational" },
  })
}

export function usePayrollPeople() {
  const { scope } = useScope()
  return useQuery({
    queryKey: scope ? qk.payroll.people.list(scope) : ["payroll", "people", "disabled"],
    enabled: Boolean(scope),
    queryFn: () => apiFetch<{ people: PayrollPerson[] }>("/api/business/payroll/people"),
    select: (d) => d.people ?? [],
    staleTime: 15 * 60_000,
    gcTime: 60 * 60_000,
    meta: { safePersist: true, webPersist: "reduced", freshness: "operational" },
  })
}

export function usePayrollRuns() {
  const { scope } = useScope()
  return useQuery({
    queryKey: scope ? qk.payroll.runs.list(scope) : ["payroll", "runs", "disabled"],
    enabled: Boolean(scope),
    queryFn: () => apiFetch<{ runs: PayrollRun[] }>("/api/business/payroll/runs"),
    select: (d) => d.runs ?? [],
    staleTime: 5 * 60_000,
    gcTime: 60 * 60_000,
    meta: { safePersist: false, webPersist: "none", freshness: "operational" },
  })
}

export function usePayrollRunDetail(runId: string | null) {
  const { scope } = useScope()
  const queryClient = useQueryClient()
  const listPlaceholder = useMemo(() => {
    if (!scope || !runId) return undefined
    const envelope = queryClient.getQueryData<{ runs: PayrollRun[] }>(qk.payroll.runs.list(scope))
    const run = envelope?.runs?.find((item) => item.id === runId)
    return run ? { run } : undefined
  }, [queryClient, runId, scope])
  return useQuery({
    queryKey: scope && runId ? qk.payroll.runs.detail(scope, runId) : ["payroll", "run", "disabled"],
    enabled: Boolean(scope) && Boolean(runId),
    queryFn: () => apiFetch<{ run: PayrollRun }>(`/api/business/payroll/runs/${runId}`),
    select: (d) => d.run,
    placeholderData: listPlaceholder,
    staleTime: 60_000,
    gcTime: 60 * 60_000,
    refetchInterval: (q) => (q.state.data?.run?.status === "executing" ? 3000 : false),
    meta: { safePersist: false, webPersist: "none", freshness: "operational" },
  })
}

export function usePayrollSchedules() {
  const { scope } = useScope()
  return useQuery({
    queryKey: scope ? qk.payroll.schedules.list(scope) : ["payroll", "schedules", "disabled"],
    enabled: Boolean(scope),
    queryFn: () => apiFetch<{ schedules: PayrollSchedule[] }>("/api/business/payroll/schedules"),
    select: (d) => d.schedules ?? [],
    staleTime: 15 * 60_000,
    gcTime: 60 * 60_000,
    meta: { safePersist: true, webPersist: "reduced", freshness: "operational" },
  })
}

export function usePayrollSettings() {
  const { scope } = useScope()
  return useQuery({
    queryKey: scope ? ["payroll", "settings", scope] : ["payroll", "settings", "disabled"],
    enabled: Boolean(scope),
    queryFn: () => apiFetch<{ settings: PayrollSettings }>("/api/business/payroll/settings"),
    select: (d) => d.settings,
    staleTime: 15 * 60_000,
    gcTime: 60 * 60_000,
    meta: { safePersist: true, webPersist: "reduced", freshness: "operational" },
  })
}
