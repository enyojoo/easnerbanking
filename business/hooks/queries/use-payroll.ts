"use client"

import { useQuery } from "@tanstack/react-query"
import { qk } from "@easner/shared"
import { apiFetch } from "@/lib/query/api-client"
import { useScope } from "@/lib/query/scope"
import type { PayrollOverview, PayrollPerson, PayrollRun, PayrollSchedule } from "@/lib/payroll/types"

export function usePayrollOverview() {
  const { scope } = useScope()
  return useQuery({
    queryKey: scope ? qk.payroll.overview(scope) : ["payroll", "overview", "disabled"],
    enabled: Boolean(scope),
    queryFn: () => apiFetch<{ overview: PayrollOverview }>("/api/business/payroll/overview"),
    select: (d) => d.overview,
    staleTime: 30_000,
    meta: { safePersist: false, webPersist: "none", freshness: "operational" },
  })
}

export function usePayrollPeople() {
  const { scope } = useScope()
  return useQuery({
    queryKey: scope ? qk.payroll.people.list(scope) : ["payroll", "people", "disabled"],
    enabled: Boolean(scope),
    queryFn: () => apiFetch<{ people: PayrollPerson[] }>("/api/business/payroll/people"),
    select: (d) => d.people ?? [],
    staleTime: 60_000,
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
    staleTime: 30_000,
    meta: { safePersist: false, webPersist: "none", freshness: "operational" },
  })
}

export function usePayrollRunDetail(runId: string | null) {
  const { scope } = useScope()
  return useQuery({
    queryKey: scope && runId ? qk.payroll.runs.detail(scope, runId) : ["payroll", "run", "disabled"],
    enabled: Boolean(scope) && Boolean(runId),
    queryFn: () => apiFetch<{ run: PayrollRun }>(`/api/business/payroll/runs/${runId}`),
    select: (d) => d.run,
    staleTime: 10_000,
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
    staleTime: 60_000,
    meta: { safePersist: true, webPersist: "reduced", freshness: "operational" },
  })
}
