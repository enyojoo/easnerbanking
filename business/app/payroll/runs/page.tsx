"use client"

import { useState } from "react"
import Link from "next/link"
import { Eye, MoreHorizontal, Pencil, Plus, Send, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { PayrollDeleteDialog } from "@/components/payroll/payroll-delete-dialog"
import { PayrollNavTabs } from "@/components/payroll/payroll-nav-tabs"
import { PayrollPageHeader } from "@/components/payroll/payroll-page-header"
import { PayrollPermissionAction } from "@/components/payroll/payroll-permission-action"
import { PayrollRunStatusBadge } from "@/components/payroll/payroll-run-status-badge"
import { usePayrollCapabilities, usePayrollRuns } from "@/hooks/queries/use-payroll"
import { useDeletePayrollRun } from "@/hooks/mutations/use-payroll"
import { formatCurrency, formatDate } from "@/lib/utils"
import type { PayrollRun } from "@/lib/payroll/types"
import { apiFetch } from "@/lib/query/api-client"

export default function PayrollRunsPage() {
  const runsQuery = usePayrollRuns()
  const capabilitiesQuery = usePayrollCapabilities()
  const canPrepare = Boolean(capabilitiesQuery.data?.canPrepare)
  const runs = runsQuery.data ?? []
  const deleteRun = useDeletePayrollRun()
  const [deleteTarget, setDeleteTarget] = useState<PayrollRun | null>(null)

  async function submitRun(runId: string) {
    try {
      await apiFetch(`/api/business/payroll/runs/${runId}`, { method: "POST", body: { action: "submit" } })
      toast.success("Submitted for approval")
      await runsQuery.refetch()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Payroll could not be submitted")
    }
  }
  return <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
    <PayrollPageHeader title="Runs" description="Create, approve, and track payroll batches and payment results." actions={
      <PayrollPermissionAction allowed={canPrepare} loading={capabilitiesQuery.isPending}><Button variant="primary" asChild><Link href="/payroll/runs/new"><Plus className="mr-2 h-4 w-4" />Run payroll</Link></Button></PayrollPermissionAction>
    } />
    <PayrollNavTabs />
    {runsQuery.isPending ? <Card className="shadow-soft"><CardContent className="space-y-3 p-5">{Array.from({ length: 5 }).map((_, index) => <Skeleton key={index} className="h-12 w-full rounded-xl" />)}</CardContent></Card> :
      runsQuery.isError ? <Card><CardContent className="p-8 text-center"><p className="font-medium">Payroll runs couldn’t be loaded</p><Button className="mt-4" variant="outline" onClick={() => void runsQuery.refetch()}>Try again</Button></CardContent></Card> :
      !runs.length ? <Card className="shadow-soft"><CardContent className="p-10 text-center"><h2 className="font-semibold">No payroll runs yet</h2><p className="mt-2 text-sm text-muted-foreground">Choose ready people, check funding, and create your first run.</p><PayrollPermissionAction allowed={canPrepare} loading={capabilitiesQuery.isPending}><Button className="mt-5" variant="primary" asChild><Link href="/payroll/runs/new">Run payroll</Link></Button></PayrollPermissionAction></CardContent></Card> :
      <Card className="overflow-hidden shadow-soft"><Table><TableHeader><TableRow><TableHead>Run</TableHead><TableHead>Pay period</TableHead><TableHead>Payday</TableHead><TableHead>People</TableHead><TableHead>Amount</TableHead><TableHead>Status</TableHead><TableHead>Created</TableHead><TableHead className="w-12"><span className="sr-only">Actions</span></TableHead></TableRow></TableHeader><TableBody>
        {runs.map((run) => <TableRow key={run.id}><TableCell><Link className="font-medium hover:underline" href={`/payroll/runs/${run.id}`}>{String(run.metadata?.name || "Payroll run")}</Link><span className="mt-0.5 block text-xs text-muted-foreground">{run.scheduleId ? "Scheduled payroll" : String(run.metadata?.offCycle ? "Off-cycle payroll" : "Regular payroll")}</span></TableCell><TableCell>{run.payPeriodStart && run.payPeriodEnd ? `${formatDate(run.payPeriodStart)} – ${formatDate(run.payPeriodEnd)}` : "—"}</TableCell><TableCell>{run.payday ? formatDate(run.payday) : "—"}</TableCell><TableCell>{run.peopleCount ?? run.lines?.length ?? run.approvalSnapshot?.people.length ?? 0}</TableCell><TableCell className="font-medium tabular-nums">{formatCurrency(run.totalSource, run.sourceCurrency)}</TableCell><TableCell><PayrollRunStatusBadge status={run.status} /></TableCell><TableCell>{formatDate(run.createdAt)}</TableCell><TableCell>
          <DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon" aria-label={`Actions for ${String(run.metadata?.name || "payroll run")}`}><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger><DropdownMenuContent align="end">
            <DropdownMenuItem asChild><Link href={`/payroll/runs/${run.id}`}><Eye />View details</Link></DropdownMenuItem>
            {run.status === "draft" && canPrepare ? <DropdownMenuItem asChild><Link href={`/payroll/runs/${run.id}/edit`}><Pencil />Edit run</Link></DropdownMenuItem> : null}
            {run.status === "draft" && canPrepare ? <DropdownMenuItem onClick={() => void submitRun(run.id)}><Send />Submit for approval</DropdownMenuItem> : null}
            {run.status === "draft" && canPrepare ? <><DropdownMenuSeparator /><DropdownMenuItem variant="destructive" onClick={() => setDeleteTarget(run)}><Trash2 />Delete draft</DropdownMenuItem></> : null}
          </DropdownMenuContent></DropdownMenu>
        </TableCell></TableRow>)}
      </TableBody></Table></Card>}
    <PayrollDeleteDialog
      open={Boolean(deleteTarget)}
      onOpenChange={(open) => !open && setDeleteTarget(null)}
      title="Delete this payroll draft?"
      description="This permanently removes the draft and its unsent payment lines. Submitted or completed payroll history cannot be deleted."
      label="Delete draft"
      pending={deleteRun.isPending}
      onDelete={async () => {
        if (!deleteTarget) return
        try {
          await deleteRun.mutateAsync(deleteTarget.id)
          toast.success("Payroll draft deleted")
        } catch (error) {
          toast.error(error instanceof Error ? error.message : "Payroll draft could not be deleted")
          throw error
        }
      }}
    />
  </div>
}
