"use client"

import { useMutation, useQueryClient } from "@tanstack/react-query"
import { qk } from "@easner/shared"
import { apiFetch } from "@/lib/query/api-client"
import { useScope } from "@/lib/query/scope"
import type {
  CreatePayrollPersonCommand,
  PayrollPerson,
  PayrollPersonInput,
  PayrollRun,
  PayrollRunDraftInput,
  PayrollRunPreview,
  PayrollSchedule,
  PayrollSettings,
} from "@/lib/payroll/types"

function invalidatePayroll(qc: ReturnType<typeof useQueryClient>, scope: ReturnType<typeof useScope>["scope"]) {
  if (!scope) return
  qc.invalidateQueries({ queryKey: qk.payroll.root(scope) })
}

export function useCreatePayrollPerson() {
  const qc = useQueryClient()
  const { scope } = useScope()
  return useMutation({
    mutationFn: (input: PayrollPersonInput | CreatePayrollPersonCommand) =>
      apiFetch<{ person: PayrollPerson }>("/api/business/payroll/people", {
        method: "POST",
        body: input,
      }),
    onSuccess: () => invalidatePayroll(qc, scope),
  })
}

export function useUpdatePayrollPerson() {
  const qc = useQueryClient()
  const { scope } = useScope()
  return useMutation({
    mutationFn: (input: { id: string; patch: Partial<PayrollPersonInput> & { status?: PayrollPerson["status"] } }) =>
      apiFetch<{ person: PayrollPerson }>(`/api/business/payroll/people/${input.id}`, {
        method: "PATCH",
        body: input.patch,
      }),
    onSuccess: () => invalidatePayroll(qc, scope),
  })
}

export function useDeletePayrollPerson() {
  const qc = useQueryClient()
  const { scope } = useScope()
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<{ ok: boolean }>(`/api/business/payroll/people/${id}`, { method: "DELETE" }),
    onSuccess: () => invalidatePayroll(qc, scope),
  })
}

export function useImportPayrollPeople() {
  const qc = useQueryClient()
  const { scope } = useScope()
  return useMutation({
    mutationFn: (file: File) => {
      const form = new FormData()
      form.append("file", file)
      return fetch("/api/business/payroll/people/import", {
        method: "POST",
        body: form,
        credentials: "include",
      }).then(async (r) => {
        const data = await r.json()
        if (!r.ok) throw new Error(data.error || "Import failed")
        return data as { imported: number; invalid: unknown[] }
      })
    },
    onSuccess: () => invalidatePayroll(qc, scope),
  })
}

export function useCreatePayrollRun() {
  const qc = useQueryClient()
  const { scope } = useScope()
  return useMutation({
    mutationFn: (input: PayrollRunDraftInput | { personIds?: string[]; offCycle?: boolean }) =>
      apiFetch<{ run: PayrollRun }>("/api/business/payroll/runs", {
        method: "POST",
        body: input ?? {},
      }),
    onSuccess: () => invalidatePayroll(qc, scope),
  })
}

export function usePreviewPayrollRun() {
  return useMutation({
    mutationFn: (input: PayrollRunDraftInput) =>
      apiFetch<{ preview: PayrollRunPreview }>("/api/business/payroll/runs/preview", {
        method: "POST",
        body: input,
      }),
  })
}

export function useUpdatePayrollRun(runId: string) {
  const qc = useQueryClient()
  const { scope } = useScope()
  return useMutation({
    mutationFn: (input: {
      lines?: Array<{ id: string; amount?: number; status?: string }>
      sourceCurrency?: string
      revision?: number
      payPeriodStart?: string | null
      payPeriodEnd?: string | null
      payday?: string | null
      name?: string | null
      note?: string | null
    }) =>
      apiFetch<{ run: PayrollRun }>(`/api/business/payroll/runs/${runId}`, {
        method: "PATCH",
        body: input,
      }),
    onSuccess: () => invalidatePayroll(qc, scope),
  })
}

export function useSubmitPayrollRun(runId: string) {
  const qc = useQueryClient()
  const { scope } = useScope()
  return useMutation({
    mutationFn: () =>
      apiFetch<{ run: PayrollRun }>(`/api/business/payroll/runs/${runId}`, {
        method: "POST",
        body: { action: "submit" },
      }),
    onSuccess: () => {
      invalidatePayroll(qc, scope)
      if (scope) qc.invalidateQueries({ queryKey: qk.approvals.root(scope) })
    },
  })
}

export function useApprovePayrollRun(runId: string) {
  const qc = useQueryClient()
  const { scope } = useScope()
  return useMutation({
    mutationFn: (input?: { mode?: "pay_now" | "schedule"; scheduledAt?: string }) =>
      apiFetch<{ run: PayrollRun }>(`/api/business/payroll/runs/${runId}/approve`, {
        method: "POST",
        body: input ?? { mode: "pay_now" },
      }),
    onSuccess: () => invalidatePayroll(qc, scope),
  })
}

export function useWithdrawPayrollRun(runId: string) {
  const qc = useQueryClient()
  const { scope } = useScope()
  return useMutation({
    mutationFn: () =>
      apiFetch<{ run: PayrollRun }>(`/api/business/payroll/runs/${runId}`, {
        method: "POST",
        body: { action: "withdraw" },
      }),
    onSuccess: () => invalidatePayroll(qc, scope),
  })
}

export function useExecutePayrollRun(runId: string) {
  const qc = useQueryClient()
  const { scope } = useScope()
  return useMutation({
    mutationFn: () =>
      apiFetch<{ run: PayrollRun }>(`/api/business/payroll/runs/${runId}/execute`, { method: "POST" }),
    onSuccess: () => invalidatePayroll(qc, scope),
  })
}

export function useRetryPayrollRun(runId: string) {
  const qc = useQueryClient()
  const { scope } = useScope()
  return useMutation({
    mutationFn: (lineIds?: string[]) =>
      apiFetch<{ retried: string[]; failed: Array<{ id: string; error: string }> }>(
        `/api/business/payroll/runs/${runId}/retry`,
        { method: "POST", body: { lineIds } },
      ),
    onSuccess: () => invalidatePayroll(qc, scope),
  })
}

export function useUpsertPayrollSchedule() {
  const qc = useQueryClient()
  const { scope } = useScope()
  return useMutation({
    mutationFn: (input: Partial<PayrollSchedule> & {
      id?: string
      timezone?: string
      draftLeadDays?: number
      approvalLeadDays?: number
      weekendPolicy?: "previous_business_day" | "next_business_day"
      sourceCurrency?: string
      sourceAccountId?: string
      fundingReminderDays?: number
      personIds?: string[]
    }) => {
      if (input.id) {
        return apiFetch<{ schedule: PayrollSchedule }>(`/api/business/payroll/schedules/${input.id}`, {
          method: "PATCH",
          body: input,
        })
      }
      return apiFetch<{ schedule: PayrollSchedule }>("/api/business/payroll/schedules", {
        method: "POST",
        body: input,
      })
    },
    onSuccess: () => invalidatePayroll(qc, scope),
  })
}

export function useInvitePayrollPerson() {
  return useMutation({
    mutationFn: (personId: string) =>
      apiFetch<{ ok: boolean }>(`/api/business/payroll/people/${personId}/invite`, { method: "POST" }),
  })
}

export function useUpdatePayrollSettings() {
  const qc = useQueryClient()
  const { scope } = useScope()
  return useMutation({
    mutationFn: (input: Partial<PayrollSettings>) =>
      apiFetch<{ settings: PayrollSettings }>("/api/business/payroll/settings", {
        method: "PATCH",
        body: input,
      }),
    onSuccess: () => invalidatePayroll(qc, scope),
  })
}
