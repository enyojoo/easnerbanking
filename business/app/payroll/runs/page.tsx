"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { Eye, MoreHorizontal, Pencil, Send, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { PayrollDeleteDialog } from "@/components/payroll/payroll-delete-dialog"
import { PayrollListToolbar } from "@/components/payroll/payroll-list-toolbar"
import { PayrollPermissionAction } from "@/components/payroll/payroll-permission-action"
import { PayrollInlineRefreshing } from "@/components/payroll/payroll-page-skeleton"
import { PayrollDetailLink } from "@/components/payroll/payroll-detail-link"
import { PayrollRunStatusBadge } from "@/components/payroll/payroll-run-status-badge"
import { usePayrollCapabilities, usePayrollRuns } from "@/hooks/queries/use-payroll"
import { useDeletePayrollRun, useSubmitPayrollRunById } from "@/hooks/mutations/use-payroll"
import { usePayrollListState } from "@/hooks/use-payroll-list-state"
import { formatCurrency, formatDate } from "@/lib/utils"
import type { PayrollRun } from "@/lib/payroll/types"

type RunFilter = "all" | "draft" | "awaiting" | "scheduled" | "completed" | "attention"
const RUN_FILTERS = ["all", "draft", "awaiting", "scheduled", "completed", "attention"] as const

export default function PayrollRunsPage() {
  const runsQuery = usePayrollRuns()
  const capabilitiesQuery = usePayrollCapabilities()
  const canPrepare = Boolean(capabilitiesQuery.data?.canPrepare)
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
  const [deleteTarget, setDeleteTarget] = useState<PayrollRun | null>(null)
  const [submittingRunIds, setSubmittingRunIds] = useState<Set<string>>(() => new Set())

  async function submitRun(runId: string) {
    if (submittingRunIds.has(runId)) return
    setSubmittingRunIds((current) => new Set(current).add(runId))
    try {
      await submitRunMutation.mutateAsync(runId)
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
  return <>
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
        { value: "awaiting", label: "Awaiting approval", count: counts.awaiting },
        { value: "scheduled", label: "Scheduled", count: counts.scheduled },
        { value: "completed", label: "Completed", count: counts.completed },
        { value: "attention", label: "Needs attention", count: counts.attention },
      ]}
    />
    {runsQuery.isPending ? <Card className="shadow-soft"><CardContent className="space-y-3 p-5">{Array.from({ length: 5 }).map((_, index) => <Skeleton key={index} className="h-12 w-full rounded-xl" />)}</CardContent></Card> :
      runsQuery.isError ? <Card><CardContent className="p-8 text-center"><p className="font-medium">Payroll runs couldn’t be loaded</p><Button className="mt-4" variant="outline" onClick={() => void runsQuery.refetch()}>Try again</Button></CardContent></Card> :
      !runs.length ? <Card className="shadow-soft"><CardContent className="p-10 text-center"><h2 className="font-semibold">{allRuns.length ? "No payroll runs match this view" : "No payroll runs yet"}</h2><p className="mt-2 text-sm text-muted-foreground">{allRuns.length ? "Try another status or search." : "Choose ready people, check funding, and create your first run."}</p>{!allRuns.length ? <PayrollPermissionAction allowed={canPrepare} loading={capabilitiesQuery.isPending}><Button className="mt-5" variant="primary" asChild><Link href="/payroll/runs/new">Run payroll</Link></Button></PayrollPermissionAction> : null}</CardContent></Card> :
      <><Card className="hidden overflow-hidden shadow-soft md:block"><Table><TableHeader><TableRow><TableHead>Run</TableHead><TableHead>Pay period</TableHead><TableHead>Payday</TableHead><TableHead>People</TableHead><TableHead>Amount</TableHead><TableHead>Status</TableHead><TableHead>Created</TableHead><TableHead className="w-12"><span className="sr-only">Actions</span></TableHead></TableRow></TableHeader><TableBody>
        {runs.map((run) => <TableRow key={run.id}><TableCell><PayrollDetailLink kind="run" id={run.id} className="font-medium hover:underline" href={`/payroll/runs/${run.id}?returnTo=${encodeURIComponent(returnTo)}`}>{String(run.metadata?.name || "Payroll run")}</PayrollDetailLink><span className="mt-0.5 block text-xs text-muted-foreground">{run.scheduleId ? "Scheduled payroll" : String(run.metadata?.offCycle ? "Off-cycle payroll" : "Regular payroll")}</span></TableCell><TableCell>{run.payPeriodStart && run.payPeriodEnd ? `${formatDate(run.payPeriodStart)} – ${formatDate(run.payPeriodEnd)}` : "—"}</TableCell><TableCell>{run.payday ? formatDate(run.payday) : "—"}</TableCell><TableCell>{run.peopleCount ?? run.lines?.length ?? run.approvalSnapshot?.people.length ?? 0}</TableCell><TableCell className="font-medium tabular-nums">{formatCurrency(run.totalSource, run.sourceCurrency)}</TableCell><TableCell><PayrollRunStatusBadge status={run.status} /></TableCell><TableCell>{formatDate(run.createdAt)}</TableCell><TableCell><RunActions run={run} returnTo={returnTo} canPrepare={canPrepare} submitting={submittingRunIds.has(run.id)} onSubmit={() => void submitRun(run.id)} onDelete={() => setDeleteTarget(run)} /></TableCell></TableRow>)}
      </TableBody></Table></Card>
      <div className="space-y-3 md:hidden">{runs.map((run) => <Card key={run.id} className="shadow-soft"><CardContent className="p-4">
        <div className="flex items-start justify-between gap-3"><div className="min-w-0"><PayrollDetailLink kind="run" id={run.id} className="block truncate font-medium" href={`/payroll/runs/${run.id}?returnTo=${encodeURIComponent(returnTo)}`}>{String(run.metadata?.name || "Payroll run")}</PayrollDetailLink><p className="mt-1 text-xs text-muted-foreground">{run.scheduleId ? "Scheduled payroll" : run.metadata?.offCycle ? "Off-cycle payroll" : "Regular payroll"}</p></div><RunActions run={run} returnTo={returnTo} canPrepare={canPrepare} submitting={submittingRunIds.has(run.id)} onSubmit={() => void submitRun(run.id)} onDelete={() => setDeleteTarget(run)} /></div>
        <div className="mt-4 flex items-center justify-between border-y py-3"><span className="text-lg font-semibold tabular-nums">{formatCurrency(run.totalSource, run.sourceCurrency)}</span><PayrollRunStatusBadge status={run.status} /></div>
        <dl className="mt-3 grid grid-cols-2 gap-3 text-sm"><div><dt className="text-xs text-muted-foreground">Payday</dt><dd className="mt-1">{run.payday ? formatDate(run.payday) : "—"}</dd></div><div><dt className="text-xs text-muted-foreground">People</dt><dd className="mt-1">{run.peopleCount ?? run.lines?.length ?? run.approvalSnapshot?.people.length ?? 0}</dd></div><div className="col-span-2"><dt className="text-xs text-muted-foreground">Pay period</dt><dd className="mt-1">{run.payPeriodStart && run.payPeriodEnd ? `${formatDate(run.payPeriodStart)} – ${formatDate(run.payPeriodEnd)}` : "—"}</dd></div></dl>
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
    <PayrollInlineRefreshing visible={runsQuery.isFetching && !runsQuery.isPending} />
  </>
}

function RunActions({
  run,
  returnTo,
  canPrepare,
  submitting,
  onSubmit,
  onDelete,
}: {
  run: PayrollRun
  returnTo: string
  canPrepare: boolean
  submitting: boolean
  onSubmit: () => void
  onDelete: () => void
}) {
  return <DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="min-h-11 min-w-11" aria-label={`Actions for ${String(run.metadata?.name || "payroll run")}`}><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger><DropdownMenuContent align="end">
    <DropdownMenuItem asChild><Link href={`/payroll/runs/${run.id}?returnTo=${encodeURIComponent(returnTo)}`}><Eye />View details</Link></DropdownMenuItem>
    {run.status === "draft" && canPrepare ? <DropdownMenuItem asChild><Link href={`/payroll/runs/${run.id}/edit`}><Pencil />Edit run</Link></DropdownMenuItem> : null}
    {run.status === "draft" && canPrepare ? <DropdownMenuItem disabled={submitting} onClick={onSubmit}><Send />{submitting ? "Submitting…" : "Submit for approval"}</DropdownMenuItem> : null}
    {(run.status === "draft" || run.status === "failed") && canPrepare ? <><DropdownMenuSeparator /><DropdownMenuItem variant="destructive" onClick={onDelete}><Trash2 />{run.status === "failed" ? "Delete failed run" : "Delete draft"}</DropdownMenuItem></> : null}
  </DropdownMenuContent></DropdownMenu>
}
