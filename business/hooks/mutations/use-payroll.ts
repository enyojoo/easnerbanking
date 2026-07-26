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

type PayrollPeopleEnvelope = { people: PayrollPerson[] }
type PayrollRunsEnvelope = { runs: PayrollRun[] }
type PayrollSchedulesEnvelope = { schedules: PayrollSchedule[] }
type PayrollPersonDetailEnvelope = { person: PayrollPerson; [key: string]: unknown }

function invalidatePayroll(qc: ReturnType<typeof useQueryClient>, scope: ReturnType<typeof useScope>["scope"]) {
  if (!scope) return
  qc.invalidateQueries({ queryKey: qk.payroll.overview(scope) })
}

function patchPeople(
  qc: ReturnType<typeof useQueryClient>,
  key: readonly unknown[],
  patch: (people: PayrollPerson[]) => PayrollPerson[],
) {
  qc.setQueryData<PayrollPeopleEnvelope>(key, (current) =>
    current ? { ...current, people: patch(current.people ?? []) } : current,
  )
}

function patchRuns(
  qc: ReturnType<typeof useQueryClient>,
  key: readonly unknown[],
  patch: (runs: PayrollRun[]) => PayrollRun[],
) {
  qc.setQueryData<PayrollRunsEnvelope>(key, (current) =>
    current ? { ...current, runs: patch(current.runs ?? []) } : current,
  )
}

function patchSchedules(
  qc: ReturnType<typeof useQueryClient>,
  key: readonly unknown[],
  patch: (schedules: PayrollSchedule[]) => PayrollSchedule[],
) {
  qc.setQueryData<PayrollSchedulesEnvelope>(key, (current) =>
    current ? { ...current, schedules: patch(current.schedules ?? []) } : current,
  )
}

function cachePerson(
  qc: ReturnType<typeof useQueryClient>,
  scope: NonNullable<ReturnType<typeof useScope>["scope"]>,
  person: PayrollPerson,
) {
  patchPeople(qc, qk.payroll.people.list(scope), (people) =>
    people.some((item) => item.id === person.id)
      ? people.map((item) => (item.id === person.id ? person : item))
      : [person, ...people],
  )
  qc.setQueryData<PayrollPersonDetailEnvelope>(qk.payroll.people.detail(scope, person.id), (current) =>
    current ? { ...current, person } : { person },
  )
}

function cacheRun(
  qc: ReturnType<typeof useQueryClient>,
  scope: NonNullable<ReturnType<typeof useScope>["scope"]>,
  run: PayrollRun,
) {
  patchRuns(qc, qk.payroll.runs.list(scope), (runs) =>
    runs.some((item) => item.id === run.id) ? runs.map((item) => (item.id === run.id ? run : item)) : [run, ...runs],
  )
  qc.setQueryData(qk.payroll.runs.detail(scope, run.id), { run })
}

function optimisticallyPatchRun(
  qc: ReturnType<typeof useQueryClient>,
  scope: NonNullable<ReturnType<typeof useScope>["scope"]>,
  runId: string,
  patch: Partial<PayrollRun>,
) {
  const listKey = qk.payroll.runs.list(scope)
  const detailKey = qk.payroll.runs.detail(scope, runId)
  const previousList = qc.getQueryData<PayrollRunsEnvelope>(listKey)
  const previousDetail = qc.getQueryData<{ run: PayrollRun }>(detailKey)
  patchRuns(qc, listKey, (runs) =>
    runs.map((run) => (run.id === runId ? { ...run, ...patch } : run)),
  )
  if (previousDetail?.run) {
    qc.setQueryData(detailKey, { ...previousDetail, run: { ...previousDetail.run, ...patch } })
  }
  return { previousList, previousDetail }
}

function restoreOptimisticRun(
  qc: ReturnType<typeof useQueryClient>,
  scope: NonNullable<ReturnType<typeof useScope>["scope"]>,
  runId: string,
  context?: {
    previousList?: PayrollRunsEnvelope
    previousDetail?: { run: PayrollRun }
  },
) {
  if (context?.previousList) qc.setQueryData(qk.payroll.runs.list(scope), context.previousList)
  if (context?.previousDetail) qc.setQueryData(qk.payroll.runs.detail(scope, runId), context.previousDetail)
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
    onSuccess: ({ person }) => {
      if (scope) cachePerson(qc, scope, person)
      invalidatePayroll(qc, scope)
    },
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
    onMutate: async ({ id, patch }) => {
      if (!scope) return {}
      const listKey = qk.payroll.people.list(scope)
      const detailKey = qk.payroll.people.detail(scope, id)
      await qc.cancelQueries({ queryKey: qk.payroll.people.root(scope) })
      const previousList = qc.getQueryData<PayrollPeopleEnvelope>(listKey)
      const previousDetail = qc.getQueryData<PayrollPersonDetailEnvelope>(detailKey)
      patchPeople(qc, listKey, (people) =>
        people.map((person) => (person.id === id ? ({ ...person, ...patch } as PayrollPerson) : person)),
      )
      if (previousDetail) {
        qc.setQueryData(detailKey, {
          ...previousDetail,
          person: { ...previousDetail.person, ...patch } as PayrollPerson,
        })
      }
      return { previousList, previousDetail }
    },
    onError: (_error, { id }, context) => {
      if (!scope) return
      if (context?.previousList) qc.setQueryData(qk.payroll.people.list(scope), context.previousList)
      if (context?.previousDetail) qc.setQueryData(qk.payroll.people.detail(scope, id), context.previousDetail)
    },
    onSuccess: ({ person }) => {
      if (scope) cachePerson(qc, scope, person)
      invalidatePayroll(qc, scope)
    },
  })
}

export function useDeletePayrollPerson() {
  const qc = useQueryClient()
  const { scope } = useScope()
  return useMutation({
    mutationFn: (id: string) => apiFetch<{ ok: boolean }>(`/api/business/payroll/people/${id}`, { method: "DELETE" }),
    onMutate: async (id) => {
      if (!scope) return {}
      const listKey = qk.payroll.people.list(scope)
      await qc.cancelQueries({ queryKey: qk.payroll.people.root(scope) })
      const previous = qc.getQueryData<PayrollPeopleEnvelope>(listKey)
      patchPeople(qc, listKey, (people) => people.filter((person) => person.id !== id))
      return { previous }
    },
    onError: (_error, _id, context) => {
      if (scope && context?.previous) qc.setQueryData(qk.payroll.people.list(scope), context.previous)
    },
    onSuccess: (_data, id) => {
      if (scope) qc.removeQueries({ queryKey: qk.payroll.people.detail(scope, id) })
      invalidatePayroll(qc, scope)
    },
  })
}

export function useDeletePayrollRun() {
  const qc = useQueryClient()
  const { scope } = useScope()
  return useMutation({
    mutationFn: (id: string) => apiFetch<{ ok: boolean }>(`/api/business/payroll/runs/${id}`, { method: "DELETE" }),
    onMutate: async (id) => {
      if (!scope) return {}
      const listKey = qk.payroll.runs.list(scope)
      await qc.cancelQueries({ queryKey: qk.payroll.runs.root(scope) })
      const previous = qc.getQueryData<PayrollRunsEnvelope>(listKey)
      patchRuns(qc, listKey, (runs) => runs.filter((run) => run.id !== id))
      return { previous }
    },
    onError: (_error, _id, context) => {
      if (scope && context?.previous) qc.setQueryData(qk.payroll.runs.list(scope), context.previous)
    },
    onSuccess: (_data, id) => {
      if (scope) qc.removeQueries({ queryKey: qk.payroll.runs.detail(scope, id) })
      invalidatePayroll(qc, scope)
    },
  })
}

export function useDeletePayrollSchedule() {
  const qc = useQueryClient()
  const { scope } = useScope()
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<{ ok: boolean }>(`/api/business/payroll/schedules/${id}`, { method: "DELETE" }),
    onMutate: async (id) => {
      if (!scope) return {}
      const listKey = qk.payroll.schedules.list(scope)
      await qc.cancelQueries({ queryKey: qk.payroll.schedules.root(scope) })
      const previous = qc.getQueryData<PayrollSchedulesEnvelope>(listKey)
      patchSchedules(qc, listKey, (schedules) => schedules.filter((schedule) => schedule.id !== id))
      return { previous }
    },
    onError: (_error, _id, context) => {
      if (scope && context?.previous) qc.setQueryData(qk.payroll.schedules.list(scope), context.previous)
    },
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
    onSuccess: () => {
      if (scope) qc.invalidateQueries({ queryKey: qk.payroll.people.list(scope) })
      invalidatePayroll(qc, scope)
    },
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
    onSuccess: ({ run }) => {
      if (scope) {
        cacheRun(qc, scope, run)
        qc.invalidateQueries({ queryKey: qk.approvals.root(scope) })
      }
      invalidatePayroll(qc, scope)
    },
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
      draft?: PayrollRunDraftInput
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
    onSuccess: ({ run }) => {
      if (scope) {
        cacheRun(qc, scope, run)
        qc.invalidateQueries({ queryKey: qk.approvals.root(scope) })
      }
      invalidatePayroll(qc, scope)
    },
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
    onMutate: async () => {
      if (!scope) return {}
      await qc.cancelQueries({ queryKey: qk.payroll.runs.root(scope) })
      return optimisticallyPatchRun(qc, scope, runId, {
        status: "pending_approval",
        submittedAt: new Date().toISOString(),
      })
    },
    onError: (_error, _variables, context) => {
      if (scope) restoreOptimisticRun(qc, scope, runId, context)
    },
    onSuccess: ({ run }) => {
      if (scope) cacheRun(qc, scope, run)
      invalidatePayroll(qc, scope)
      if (scope) qc.invalidateQueries({ queryKey: qk.approvals.root(scope) })
    },
  })
}

export function useSubmitPayrollRunById() {
  const qc = useQueryClient()
  const { scope } = useScope()
  return useMutation({
    mutationFn: (runId: string) =>
      apiFetch<{ run: PayrollRun }>(`/api/business/payroll/runs/${runId}`, {
        method: "POST",
        body: { action: "submit" },
      }),
    onMutate: async (runId) => {
      if (!scope) return {}
      await qc.cancelQueries({ queryKey: qk.payroll.runs.root(scope) })
      return {
        runId,
        ...optimisticallyPatchRun(qc, scope, runId, {
          status: "pending_approval",
          submittedAt: new Date().toISOString(),
        }),
      }
    },
    onError: (_error, runId, context) => {
      if (scope) restoreOptimisticRun(qc, scope, runId, context)
    },
    onSuccess: ({ run }) => {
      if (scope) {
        cacheRun(qc, scope, run)
        qc.invalidateQueries({ queryKey: qk.approvals.root(scope) })
      }
      invalidatePayroll(qc, scope)
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
    onMutate: async (input) => {
      if (!scope) return {}
      await qc.cancelQueries({ queryKey: qk.payroll.runs.root(scope) })
      return optimisticallyPatchRun(qc, scope, runId, {
        status: input?.mode === "schedule" ? "scheduled" : "approved",
        approvedAt: new Date().toISOString(),
      })
    },
    onError: (_error, _variables, context) => {
      if (scope) restoreOptimisticRun(qc, scope, runId, context)
    },
    onSuccess: ({ run }) => {
      if (scope) {
        cacheRun(qc, scope, run)
        qc.invalidateQueries({ queryKey: qk.approvals.root(scope) })
      }
      invalidatePayroll(qc, scope)
    },
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
    onMutate: async () => {
      if (!scope) return {}
      await qc.cancelQueries({ queryKey: qk.payroll.runs.root(scope) })
      return optimisticallyPatchRun(qc, scope, runId, {
        status: "draft",
        submittedAt: null,
      })
    },
    onError: (_error, _variables, context) => {
      if (scope) restoreOptimisticRun(qc, scope, runId, context)
    },
    onSuccess: ({ run }) => {
      if (scope) {
        cacheRun(qc, scope, run)
        qc.invalidateQueries({ queryKey: qk.approvals.root(scope) })
      }
      invalidatePayroll(qc, scope)
    },
  })
}

export function useRejectPayrollRun(runId: string) {
  const qc = useQueryClient()
  const { scope } = useScope()
  return useMutation({
    mutationFn: (reason: string) =>
      apiFetch<{ run: PayrollRun }>(`/api/business/payroll/runs/${runId}`, {
        method: "POST",
        body: { action: "reject", reason },
      }),
    onMutate: async (reason) => {
      if (!scope) return {}
      await qc.cancelQueries({ queryKey: qk.payroll.runs.root(scope) })
      return optimisticallyPatchRun(qc, scope, runId, {
        status: "draft",
        submittedAt: null,
        metadata: {
          ...(qc.getQueryData<{ run: PayrollRun }>(qk.payroll.runs.detail(scope, runId))?.run.metadata ?? {}),
          rejectionReason: reason,
        },
      })
    },
    onError: (_error, _reason, context) => {
      if (scope) restoreOptimisticRun(qc, scope, runId, context)
    },
    onSuccess: ({ run }) => {
      if (scope) {
        cacheRun(qc, scope, run)
        qc.invalidateQueries({ queryKey: qk.approvals.root(scope) })
      }
      invalidatePayroll(qc, scope)
    },
  })
}

export function useCancelPayrollRun(runId: string) {
  const qc = useQueryClient()
  const { scope } = useScope()
  return useMutation({
    mutationFn: () =>
      apiFetch<{ run: PayrollRun }>(`/api/business/payroll/runs/${runId}`, {
        method: "POST",
        body: { action: "cancel" },
      }),
    onMutate: async () => {
      if (!scope) return {}
      await qc.cancelQueries({ queryKey: qk.payroll.runs.root(scope) })
      return optimisticallyPatchRun(qc, scope, runId, { status: "cancelled" })
    },
    onError: (_error, _variables, context) => {
      if (scope) restoreOptimisticRun(qc, scope, runId, context)
    },
    onSuccess: ({ run }) => {
      if (scope) cacheRun(qc, scope, run)
      invalidatePayroll(qc, scope)
    },
  })
}

export function useExecutePayrollRun(runId: string) {
  const qc = useQueryClient()
  const { scope } = useScope()
  return useMutation({
    mutationFn: () => apiFetch<{ run: PayrollRun }>(`/api/business/payroll/runs/${runId}/execute`, { method: "POST" }),
    onMutate: async () => {
      if (!scope) return {}
      await qc.cancelQueries({ queryKey: qk.payroll.runs.root(scope) })
      return optimisticallyPatchRun(qc, scope, runId, { status: "executing" })
    },
    onError: (_error, _variables, context) => {
      if (scope) restoreOptimisticRun(qc, scope, runId, context)
    },
    onSuccess: ({ run }) => {
      if (scope) cacheRun(qc, scope, run)
      invalidatePayroll(qc, scope)
    },
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
    onMutate: async () => {
      if (!scope) return {}
      await qc.cancelQueries({ queryKey: qk.payroll.runs.root(scope) })
      return optimisticallyPatchRun(qc, scope, runId, { status: "executing" })
    },
    onError: (_error, _variables, context) => {
      if (scope) restoreOptimisticRun(qc, scope, runId, context)
    },
    onSettled: () => {
      if (scope) {
        qc.invalidateQueries({ queryKey: qk.payroll.runs.detail(scope, runId) })
        qc.invalidateQueries({ queryKey: qk.payroll.runs.list(scope) })
      }
      invalidatePayroll(qc, scope)
    },
  })
}

export function useUpsertPayrollSchedule() {
  const qc = useQueryClient()
  const { scope } = useScope()
  return useMutation({
    mutationFn: (
      input: Partial<PayrollSchedule> & {
        id?: string
        timezone?: string
        draftLeadDays?: number
        approvalLeadDays?: number
        weekendPolicy?: "previous_business_day" | "next_business_day"
        sourceCurrency?: string
        sourceAccountId?: string
        fundingReminderDays?: number
        personIds?: string[]
      },
    ) => {
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
    onMutate: async (input) => {
      if (!scope || !input.id) return {}
      const listKey = qk.payroll.schedules.list(scope)
      await qc.cancelQueries({ queryKey: qk.payroll.schedules.root(scope) })
      const previous = qc.getQueryData<PayrollSchedulesEnvelope>(listKey)
      patchSchedules(qc, listKey, (schedules) =>
        schedules.map((schedule) =>
          schedule.id === input.id ? ({ ...schedule, ...input } as PayrollSchedule) : schedule,
        ),
      )
      return { previous }
    },
    onError: (_error, _input, context) => {
      if (scope && context?.previous) {
        qc.setQueryData(qk.payroll.schedules.list(scope), context.previous)
      }
    },
    onSuccess: ({ schedule }) => {
      if (scope) {
        patchSchedules(qc, qk.payroll.schedules.list(scope), (schedules) =>
          schedules.some((item) => item.id === schedule.id)
            ? schedules.map((item) => (item.id === schedule.id ? schedule : item))
            : [schedule, ...schedules],
        )
      }
      invalidatePayroll(qc, scope)
    },
  })
}

export function useInvitePayrollPerson() {
  const qc = useQueryClient()
  const { scope } = useScope()
  return useMutation({
    mutationFn: (personId: string) =>
      apiFetch<{ ok: boolean }>(`/api/business/payroll/people/${personId}/invite`, { method: "POST" }),
    onMutate: async (personId) => {
      if (!scope) return {}
      const listKey = qk.payroll.people.list(scope)
      const detailKey = qk.payroll.people.detail(scope, personId)
      await qc.cancelQueries({ queryKey: qk.payroll.people.root(scope) })
      const previousList = qc.getQueryData<PayrollPeopleEnvelope>(listKey)
      const previousDetail = qc.getQueryData<PayrollPersonDetailEnvelope>(detailKey)
      patchPeople(qc, listKey, (people) =>
        people.map((person) => (person.id === personId ? { ...person, connectionStatus: "pending" } : person)),
      )
      if (previousDetail) {
        qc.setQueryData(detailKey, {
          ...previousDetail,
          person: { ...previousDetail.person, connectionStatus: "pending" },
        })
      }
      return { previousList, previousDetail }
    },
    onError: (_error, personId, context) => {
      if (!scope) return
      if (context?.previousList) qc.setQueryData(qk.payroll.people.list(scope), context.previousList)
      if (context?.previousDetail) qc.setQueryData(qk.payroll.people.detail(scope, personId), context.previousDetail)
    },
    onSuccess: (_data, personId) => {
      if (!scope) return
      qc.invalidateQueries({ queryKey: qk.payroll.overview(scope) })
    },
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
    onMutate: async (input) => {
      if (!scope) return {}
      const key = ["payroll", "settings", scope] as const
      await qc.cancelQueries({ queryKey: key })
      const previous = qc.getQueryData<{ settings: PayrollSettings }>(key)
      if (previous) {
        qc.setQueryData(key, {
          ...previous,
          settings: { ...previous.settings, ...input },
        })
      }
      return { previous }
    },
    onError: (_error, _input, context) => {
      if (scope && context?.previous) {
        qc.setQueryData(["payroll", "settings", scope], context.previous)
      }
    },
    onSuccess: ({ settings }) => {
      if (scope) qc.setQueryData(["payroll", "settings", scope], { settings })
      invalidatePayroll(qc, scope)
    },
  })
}
