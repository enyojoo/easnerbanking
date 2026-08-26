"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { PayrollDeleteDialog } from "@/components/payroll/payroll-delete-dialog"
import { PayrollListToolbar } from "@/components/payroll/payroll-list-toolbar"
import { PayrollPermissionAction } from "@/components/payroll/payroll-permission-action"
import { PayrollInlineRefreshing } from "@/components/payroll/payroll-page-skeleton"
import { PayrollDetailLink } from "@/components/payroll/payroll-detail-link"
import { PayrollRunStatusBadge } from "@/components/payroll/payroll-run-status-badge"
import { PayrollRunActionsMenu } from "@/components/payroll/payroll-run-actions-menu"
import { PayrollRunActionConfirmDialog } from "@/components/payroll/payroll-run-action-confirm-dialog"
import { usePayrollCapabilities, usePayrollRuns } from "@/hooks/queries/use-payroll"
import {
  useCancelPayrollRunById,
  useDeletePayrollRun,
  useReturnPayrollRunToDraft,
  useSubmitPayrollRunById,
} from "@/hooks/mutations/use-payroll"
import { usePayrollListState } from "@/hooks/use-payroll-list-state"
import { formatCurrency, formatDate } from "@/lib/utils"
import type { PayrollRun } from "@/lib/payroll/types"
import {
  getPayrollRunActions,
  type PayrollRunAction,
} from "@/lib/payroll/run-actions"
import { analytics } from "@/lib/analytics"

type RunFilter = "all" | "draft" | "awaiting" | "scheduled" | "completed" | "attention"
const RUN_FILTERS = ["all", "draft", "awaiting", "scheduled", "completed", "attention"] as const

export default function PayrollRunsPage() {
  const router = useRouter()
  const runsQuery = usePayrollRuns()
  const capabilitiesQuery = usePayrollCapabilities()
  const canPrepare = Boolean(capabilitiesQuery.data?.canPrepare)
  const canApprove = Boolean(capabilitiesQuery.data?.canApprove)
  const allRuns = useMemo(() => runsQuery.data ?? [], [runsQuery.data])
  const { query, filter, setQuery, setFilter, returnTo } = usePayrollListState<RunFilter>({
    allowedFilters: RUN_FILTERS,
    defaultFilter: "all",
    filterParam: "status",
  })
  const counts = useMemo(() => ({
    all: allRuns.length,
    draft: allRuns.filter((run) => run.status === "draft").length,
    awaiting: allRuns.filter((run) => run.status === "pending_approval").length,
    scheduled: allRuns.filter((run) => run.status === "scheduled").length,
    completed: allRuns.filter((run) => run.status === "completed").length,
    attention: allRuns.filter((run) => ["partial", "failed", "needs_reapproval"].includes(run.status)).length,
  }), [allRuns])
  const runs = useMemo(() => allRuns.filter((run) => {
    const normalizedQuery = query.trim().toLowerCase()
    if (
      normalizedQuery &&
      !`${String(run.metadata?.name || "")} ${run.payPeriodStart || ""} ${run.payPeriodEnd || ""} ${run.payday || ""}`
        .toLowerCase()
        .includes(normalizedQuery)
    ) return false
    if (filter === "draft") return run.status === "draft"
    if (filter === "awaiting") return run.status === "pending_approval"
    if (filter === "scheduled") return run.status === "scheduled"
    if (filter === "completed") return run.status === "completed"
    if (filter === "attention") return ["partial", "failed", "needs_reapproval"].includes(run.status)
    return true
  }), [allRuns, filter, query])
  const deleteRun = useDeletePayrollRun()
  const submitRunMutation = useSubmitPayrollRunById()
  const returnToDraft = useReturnPayrollRunToDraft()
  const cancelRun = useCancelPayrollRunById()
  const [deleteTarget, setDeleteTarget] = useState<PayrollRun | null>(null)
  const [returnTarget, setReturnTarget] = useState<{ run: PayrollRun; editAfter: boolean } | null>(null)
  const [cancelTarget, setCancelTarget] = useState<PayrollRun | null>(null)
  const [submittingRunIds, setSubmittingRunIds] = useState<Set<string>>(() => new Set())

  async function submitRun(runId: string) {
    if (submittingRunIds.has(runId)) return
    setSubmittingRunIds((current) => new Set(current).add(runId))
    try {
      await submitRunMutation.mutateAsync(runId)
      analytics.trackPayrollRunSubmitted({ runId })
      toast.success("Submitted for approval")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Payroll could not be submitted")
    } finally {
      setSubmittingRunIds((current) => {
        const next = new Set(current)
        next.delete(runId)
        return next
      })
    }
  }

  function handleRunAction(run: PayrollRun, action: PayrollRunAction) {
    if (action === "submit") {
      void submitRun(run.id)
      return
    }
    if (action === "return_to_draft" || (action === "edit" && run.status === "failed")) {
      setReturnTarget({ run, editAfter: action === "edit" })
      return
    }
    if (action === "cancel") {
      setCancelTarget(run)
      return
    }
    if (action === "delete") {
      setDeleteTarget(run)
      return
    }
    router.push(`/payroll/runs/${run.id}?returnTo=${encodeURIComponent(returnTo)}`)
  }
  return (
    <div className="flex flex-col gap-6">
    <PayrollListToolbar
      query={query}
      onQueryChange={setQuery}
      queryPlaceholder="Search payroll runs"
      filter={filter}
      onFilterChange={setFilter}
      label="Filter payroll runs"
      filters={[
        { value: "all", label: "All", count: counts.all },
        { value: "draft", label: "Draft", count: counts.draft },
        { value: "awaiting", label: "Awaiting", count: counts.awaiting },
        { value: "scheduled", label: "Scheduled", count: counts.scheduled },
        { value: "completed", label: "Completed", count: counts.completed },
        { value: "attention", label: "Attention", count: counts.attention },
      ]}
    />
    {runsQuery.isPending && !runsQuery.data ? <Card className="shadow-soft"><CardContent className="space-y-3 p-5">{Array.from({ length: 5 }).map((_, index) => <Skeleton key={index} className="h-12 w-full rounded-xl" />)}</CardContent></Card> :
      runsQuery.isError ? <Card><CardContent className="p-8 text-center"><p className="font-medium">Payroll runs couldn’t be loaded</p><Button className="mt-4" variant="outline" onClick={() => void runsQuery.refetch()}>Try again</Button></CardContent></Card> :
      !runs.length ? <Card className="shadow-soft"><CardContent className="p-10 text-center"><h2 className="font-semibold">{allRuns.length ? "No payroll runs match this view" : "No payroll runs yet"}</h2><p className="mt-2 text-sm text-muted-foreground">{allRuns.length ? "Try another status or search." : "Choose ready people, check funding, and create your first run."}</p>{!allRuns.length ? <PayrollPermissionAction allowed={canPrepare} loading={capabilitiesQuery.isPending}><Button className="mt-5" variant="primary" asChild><Link href="/payroll/runs/new">Run payroll</Link></Button></PayrollPermissionAction> : null}</CardContent></Card> :
      <><Card className="hidden overflow-hidden shadow-soft md:block"><Table><TableHeader><TableRow><TableHead>Run</TableHead><TableHead>Pay period</TableHead><TableHead>Payday</TableHead><TableHead>People</TableHead><TableHead>Amount</TableHead><TableHead>Status</TableHead><TableHead>Created</TableHead><TableHead className="w-12"><span className="sr-only">Actions</span></TableHead></TableRow></TableHeader><TableBody>
        {runs.map((run) => <TableRow key={run.id}><TableCell><PayrollDetailLink kind="run" id={run.id} className="font-medium hover:underline" href={`/payroll/runs/${run.id}?returnTo=${encodeURIComponent(returnTo)}`}>{String(run.metadata?.name || "Payroll run")}</PayrollDetailLink><span className="mt-0.5 block text-xs text-muted-foreground">{run.scheduleId ? "Scheduled payroll" : String(run.metadata?.offCycle ? "Off-cycle payroll" : "Regular payroll")}</span></TableCell><TableCell>{run.payPeriodStart && run.payPeriodEnd ? `${formatDate(run.payPeriodStart)} – ${formatDate(run.payPeriodEnd)}` : "–"}</TableCell><TableCell>{run.payday ? formatDate(run.payday) : "–"}</TableCell><TableCell>{run.peopleCount ?? run.lines?.length ?? run.approvalSnapshot?.people.length ?? 0}</TableCell><TableCell className="font-medium tabular-nums">{formatCurrency(run.totalSource, run.sourceCurrency)}</TableCell><TableCell><PayrollRunStatusBadge status={run.status} /></TableCell><TableCell>{formatDate(run.createdAt)}</TableCell><TableCell><PayrollRunActionsMenu runId={run.id} runName={String(run.metadata?.name || "Payroll run")} actions={getPayrollRunActions({ run, canPrepare, canApprove, canSelfApprove: capabilitiesQuery.data?.canSelfApprove, hasPayStubs: run.hasPayStubs })} detailHref={`/payroll/runs/${run.id}?returnTo=${encodeURIComponent(returnTo)}`} returnTo={returnTo} showView interceptActions={run.status === "failed" ? ["edit"] : undefined} disabledActions={{ submit: submittingRunIds.has(run.id), return_to_draft: returnToDraft.isPending, cancel: cancelRun.isPending, delete: deleteRun.isPending }} onAction={(action) => handleRunAction(run, action)} /></TableCell></TableRow>)}
      </TableBody></Table></Card>
      <div className="space-y-3 md:hidden">{runs.map((run) => <Card key={run.id} className="shadow-soft"><CardContent className="p-4">
        <div className="flex items-start justify-between gap-3"><div className="min-w-0"><PayrollDetailLink kind="run" id={run.id} className="block truncate font-medium" href={`/payroll/runs/${run.id}?returnTo=${encodeURIComponent(returnTo)}`}>{String(run.metadata?.name || "Payroll run")}</PayrollDetailLink><p className="mt-1 text-xs text-muted-foreground">{run.scheduleId ? "Scheduled payroll" : run.metadata?.offCycle ? "Off-cycle payroll" : "Regular payroll"}</p></div><PayrollRunActionsMenu runId={run.id} runName={String(run.metadata?.name || "Payroll run")} actions={getPayrollRunActions({ run, canPrepare, canApprove, canSelfApprove: capabilitiesQuery.data?.canSelfApprove, hasPayStubs: run.hasPayStubs })} detailHref={`/payroll/runs/${run.id}?returnTo=${encodeURIComponent(returnTo)}`} returnTo={returnTo} showView interceptActions={run.status === "failed" ? ["edit"] : undefined} disabledActions={{ submit: submittingRunIds.has(run.id), return_to_draft: returnToDraft.isPending, cancel: cancelRun.isPending, delete: deleteRun.isPending }} onAction={(action) => handleRunAction(run, action)} /></div>
        <div className="mt-4 flex items-center justify-between border-y py-3"><span className="text-lg font-semibold tabular-nums">{formatCurrency(run.totalSource, run.sourceCurrency)}</span><PayrollRunStatusBadge status={run.status} /></div>
        <dl className="mt-3 grid grid-cols-2 gap-3 text-sm"><div><dt className="text-xs text-muted-foreground">Payday</dt><dd className="mt-1">{run.payday ? formatDate(run.payday) : "–"}</dd></div><div><dt className="text-xs text-muted-foreground">People</dt><dd className="mt-1">{run.peopleCount ?? run.lines?.length ?? run.approvalSnapshot?.people.length ?? 0}</dd></div><div className="col-span-2"><dt className="text-xs text-muted-foreground">Pay period</dt><dd className="mt-1">{run.payPeriodStart && run.payPeriodEnd ? `${formatDate(run.payPeriodStart)} – ${formatDate(run.payPeriodEnd)}` : "–"}</dd></div></dl>
      </CardContent></Card>)}</div></>}
    <PayrollDeleteDialog
      open={Boolean(deleteTarget)}
      onOpenChange={(open) => !open && setDeleteTarget(null)}
      title={deleteTarget?.status === "failed" ? "Delete this failed payroll run?" : "Delete this payroll draft?"}
      description={deleteTarget?.status === "failed"
        ? "This permanently removes the failed run and its unsuccessful payment lines. No completed payment history will be deleted."
        : "This permanently removes the draft and its unsent payment lines. Submitted or completed payroll history cannot be deleted."}
      label={deleteTarget?.status === "failed" ? "Delete failed run" : "Delete draft"}
      pending={deleteRun.isPending}
      onDelete={async () => {
        if (!deleteTarget) return
        try {
          await deleteRun.mutateAsync(deleteTarget.id)
          toast.success(deleteTarget.status === "failed" ? "Failed payroll run deleted" : "Payroll draft deleted")
        } catch (error) {
          toast.error(error instanceof Error ? error.message : "Payroll run could not be deleted")
          throw error
        }
      }}
    />
    <PayrollRunActionConfirmDialog
      open={Boolean(returnTarget)}
      onOpenChange={(open) => !open && setReturnTarget(null)}
      title={returnTarget?.editAfter ? "Reopen this failed run?" : "Return this run to draft?"}
      description={
        returnTarget?.editAfter
          ? "The failed payment state will be cleared and the run will reopen in the payroll builder."
          : "Approval, scheduling, and quote details will be cleared. The run’s audit history will remain available."
      }
      confirmLabel={returnTarget?.editAfter ? "Reopen and edit" : "Return to draft"}
      pending={returnToDraft.isPending}
      onConfirm={async () => {
        if (!returnTarget) return
        const { run, editAfter } = returnTarget
        try {
          await returnToDraft.mutateAsync(run.id)
          setReturnTarget(null)
          toast.success("Payroll run returned to draft")
          if (editAfter) {
            router.push(
              `/payroll/runs/new?edit=${encodeURIComponent(run.id)}&returnTo=${encodeURIComponent(returnTo)}`,
            )
          }
        } catch (error) {
          toast.error(error instanceof Error ? error.message : "Payroll run could not be returned to draft")
        }
      }}
    />
    <PayrollRunActionConfirmDialog
      open={Boolean(cancelTarget)}
      onOpenChange={(open) => !open && setCancelTarget(null)}
      title="Cancel this scheduled payroll?"
      description="The payment will not be sent at its scheduled time. You can return the cancelled run to draft afterward."
      confirmLabel="Cancel schedule"
      pending={cancelRun.isPending}
      destructive
      onConfirm={async () => {
        if (!cancelTarget) return
        try {
          await cancelRun.mutateAsync(cancelTarget.id)
          setCancelTarget(null)
          toast.success("Scheduled payroll cancelled")
        } catch (error) {
          toast.error(error instanceof Error ? error.message : "Schedule could not be cancelled")
        }
      }}
    />
    <PayrollInlineRefreshing visible={runsQuery.isFetching && !runsQuery.isPending} />
    </div>
  )
}
