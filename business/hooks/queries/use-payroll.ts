"use client"

import { useMemo } from "react"
import { queryOptions, useQuery, useQueryClient } from "@tanstack/react-query"
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
  PayrollTimingPreview,
} from "@/lib/payroll/types"

type PayrollScope = NonNullable<ReturnType<typeof useScope>["scope"]>
type PayrollPersonDetailEnvelope = {
  person: PayrollPerson
  paymentHistory?: unknown[]
  connection?: {
    id: string
    status: string
    preferredMethod: PayrollReceivingMethodSummary | null
  } | null
}

export function payrollCapabilitiesQueryOptions(scope: PayrollScope) {
  return queryOptions({
    queryKey: ["payroll", "capabilities", scope] as const,
    queryFn: () => apiFetch<{ capabilities: PayrollCapabilities }>("/api/business/payroll/capabilities"),
    staleTime: 60_000,
    meta: { safePersist: false, webPersist: "none" as const, freshness: "operational" },
  })
}

export function payrollOverviewQueryOptions(scope: PayrollScope) {
  return queryOptions({
    queryKey: qk.payroll.overview(scope),
    queryFn: () => apiFetch<{ overview: PayrollOverview }>("/api/business/payroll/overview"),
    staleTime: 5 * 60_000,
    gcTime: 60 * 60_000,
    meta: { safePersist: true, webPersist: "reduced" as const, freshness: "operational" },
  })
}

export function payrollPeopleQueryOptions(scope: PayrollScope) {
  return queryOptions({
    queryKey: qk.payroll.people.list(scope),
    queryFn: () => apiFetch<{ people: PayrollPerson[] }>("/api/business/payroll/people"),
    staleTime: 15 * 60_000,
    gcTime: 60 * 60_000,
    meta: { safePersist: true, webPersist: "reduced" as const, freshness: "operational" },
  })
}

export function payrollRunsQueryOptions(scope: PayrollScope) {
  return queryOptions({
    queryKey: qk.payroll.runs.list(scope),
    queryFn: () => apiFetch<{ runs: PayrollRun[] }>("/api/business/payroll/runs"),
    staleTime: 5 * 60_000,
    gcTime: 60 * 60_000,
    meta: { safePersist: false, webPersist: "none" as const, freshness: "operational" },
  })
}

export function payrollSchedulesQueryOptions(scope: PayrollScope) {
  return queryOptions({
    queryKey: qk.payroll.schedules.list(scope),
    queryFn: () => apiFetch<{ schedules: PayrollSchedule[] }>("/api/business/payroll/schedules"),
    staleTime: 15 * 60_000,
    gcTime: 60 * 60_000,
    meta: { safePersist: true, webPersist: "reduced" as const, freshness: "operational" },
  })
}

export function payrollSettingsQueryOptions(scope: PayrollScope) {
  return queryOptions({
    queryKey: ["payroll", "settings", scope] as const,
    queryFn: () => apiFetch<{ settings: PayrollSettings }>("/api/business/payroll/settings"),
    staleTime: 15 * 60_000,
    gcTime: 60 * 60_000,
    meta: { safePersist: true, webPersist: "reduced" as const, freshness: "operational" },
  })
}

export function payrollPersonDetailQueryOptions(scope: PayrollScope, personId: string) {
  return queryOptions({
    queryKey: qk.payroll.people.detail(scope, personId),
    queryFn: () => fetchPayrollPersonDetail(personId),
    staleTime: 5 * 60_000,
    gcTime: 60 * 60_000,
    meta: { safePersist: false, webPersist: "none" as const, freshness: "operational" },
  })
}

function fetchPayrollPersonDetail(personId: string) {
  return apiFetch<PayrollPersonDetailEnvelope>(`/api/business/payroll/people/${personId}`)
}

export function payrollRunDetailQueryOptions(scope: PayrollScope, runId: string) {
  return queryOptions({
    queryKey: qk.payroll.runs.detail(scope, runId),
    queryFn: () => apiFetch<{ run: PayrollRun }>(`/api/business/payroll/runs/${runId}`),
    staleTime: 60_000,
    gcTime: 60 * 60_000,
    meta: { safePersist: false, webPersist: "none" as const, freshness: "operational" },
  })
}

export function usePayrollCapabilities() {
  const { scope } = useScope()
  return useQuery<{ capabilities: PayrollCapabilities }, Error, PayrollCapabilities>({
    queryKey: scope
      ? payrollCapabilitiesQueryOptions(scope).queryKey
      : (["payroll", "capabilities", "disabled"] as const),
    queryFn: () => apiFetch<{ capabilities: PayrollCapabilities }>("/api/business/payroll/capabilities"),
    enabled: Boolean(scope),
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
  return useQuery<PayrollPersonDetailEnvelope>({
    queryKey: scope && personId ? qk.payroll.people.detail(scope, personId) : ["payroll", "person", "disabled"],
    enabled: Boolean(scope && personId),
    queryFn: () => fetchPayrollPersonDetail(personId as string),
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
  return useQuery<{ overview: PayrollOverview }, Error, PayrollOverview>({
    queryKey: scope ? payrollOverviewQueryOptions(scope).queryKey : (["payroll", "overview", "disabled"] as const),
    queryFn: () => apiFetch<{ overview: PayrollOverview }>("/api/business/payroll/overview"),
    enabled: Boolean(scope),
    select: (d) => d.overview,
    staleTime: 5 * 60_000,
    gcTime: 60 * 60_000,
    meta: { safePersist: true, webPersist: "reduced", freshness: "operational" },
  })
}

export function usePayrollPeople() {
  const { scope } = useScope()
  return useQuery<{ people: PayrollPerson[] }, Error, PayrollPerson[]>({
    queryKey: scope ? payrollPeopleQueryOptions(scope).queryKey : (["payroll", "people", "disabled"] as const),
    queryFn: () => apiFetch<{ people: PayrollPerson[] }>("/api/business/payroll/people"),
    enabled: Boolean(scope),
    select: (d) => d.people ?? [],
    staleTime: 15 * 60_000,
    gcTime: 60 * 60_000,
    meta: { safePersist: true, webPersist: "reduced", freshness: "operational" },
  })
}

export function usePayrollRuns() {
  const { scope } = useScope()
  return useQuery<{ runs: PayrollRun[] }, Error, PayrollRun[]>({
    queryKey: scope ? payrollRunsQueryOptions(scope).queryKey : (["payroll", "runs", "disabled"] as const),
    queryFn: () => apiFetch<{ runs: PayrollRun[] }>("/api/business/payroll/runs"),
    enabled: Boolean(scope),
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
  return useQuery<{ run: PayrollRun }, Error, PayrollRun>({
    queryKey: scope && runId ? qk.payroll.runs.detail(scope, runId) : ["payroll", "run", "disabled"],
    enabled: Boolean(scope) && Boolean(runId),
    queryFn: () => apiFetch<{ run: PayrollRun }>(`/api/business/payroll/runs/${runId}`),
    select: (d) => d.run,
    placeholderData: listPlaceholder,
    staleTime: 60_000,
    gcTime: 60 * 60_000,
    refetchInterval: (q) => {
      const run = q.state.data?.run
      const job = run?.metadata?.executionJob as { status?: string } | undefined
      return run?.status === "executing" ||
        ["queued", "processing", "retry"].includes(String(job?.status || ""))
        ? 3000
        : false
    },
    meta: { safePersist: false, webPersist: "none", freshness: "operational" },
  })
}

export function usePayrollSchedules() {
  const { scope } = useScope()
  return useQuery<{ schedules: PayrollSchedule[] }, Error, PayrollSchedule[]>({
    queryKey: scope
      ? payrollSchedulesQueryOptions(scope).queryKey
      : (["payroll", "schedules", "disabled"] as const),
    queryFn: () => apiFetch<{ schedules: PayrollSchedule[] }>("/api/business/payroll/schedules"),
    enabled: Boolean(scope),
    select: (d) => d.schedules ?? [],
    staleTime: 15 * 60_000,
    gcTime: 60 * 60_000,
    meta: { safePersist: true, webPersist: "reduced", freshness: "operational" },
  })
}

export function usePayrollSettings() {
  const { scope } = useScope()
  return useQuery<{ settings: PayrollSettings }, Error, PayrollSettings>({
    queryKey: scope ? payrollSettingsQueryOptions(scope).queryKey : (["payroll", "settings", "disabled"] as const),
    queryFn: () => apiFetch<{ settings: PayrollSettings }>("/api/business/payroll/settings"),
    enabled: Boolean(scope),
    select: (d) => d.settings,
    staleTime: 15 * 60_000,
    gcTime: 60 * 60_000,
    meta: { safePersist: true, webPersist: "reduced", freshness: "operational" },
  })
}

export function usePayrollTimingPreview(
  payday: string | null | undefined,
  overrides?: { timezone?: string; localTime?: string },
) {
  const { scope } = useScope()
  const timezone = overrides?.timezone || ""
  const localTime = overrides?.localTime || ""
  return useQuery<{ timing: PayrollTimingPreview }, Error, PayrollTimingPreview>({
    queryKey:
      scope && payday
        ? ["payroll", "timing-preview", scope, payday, timezone, localTime]
        : ["payroll", "timing-preview", "disabled"],
    enabled: Boolean(scope && payday),
    queryFn: () =>
      apiFetch<{ timing: PayrollTimingPreview }>("/api/business/payroll/timing-preview", {
        method: "POST",
        body: {
          payday,
          ...(timezone ? { timezone } : {}),
          ...(localTime ? { localTime } : {}),
        },
      }),
    select: (data) => data.timing,
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
    meta: { safePersist: false, webPersist: "none", freshness: "operational" },
  })
}
