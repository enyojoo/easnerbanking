"use client"

import Link from "next/link"
import { Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { PayrollNavTabs } from "@/components/payroll/payroll-nav-tabs"
import { PayrollPageHeader } from "@/components/payroll/payroll-page-header"
import { PayrollPermissionAction } from "@/components/payroll/payroll-permission-action"
import { PayrollRunStatusBadge } from "@/components/payroll/payroll-run-status-badge"
import { usePayrollCapabilities, usePayrollRuns } from "@/hooks/queries/use-payroll"
import { formatCurrency, formatDate } from "@/lib/utils"

export default function PayrollRunsPage() {
  const runsQuery = usePayrollRuns()
  const capabilitiesQuery = usePayrollCapabilities()
  const canPrepare = Boolean(capabilitiesQuery.data?.canPrepare)
  const runs = runsQuery.data ?? []
  return <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
    <PayrollPageHeader title="Runs" description="Create, approve, and track payroll batches and payment results." actions={
      <PayrollPermissionAction allowed={canPrepare} loading={capabilitiesQuery.isPending}><Button variant="primary" asChild><Link href="/payroll/runs/new"><Plus className="mr-2 h-4 w-4" />Run payroll</Link></Button></PayrollPermissionAction>
    } />
    <PayrollNavTabs />
    {runsQuery.isPending ? <Card className="shadow-soft"><CardContent className="space-y-3 p-5">{Array.from({ length: 5 }).map((_, index) => <Skeleton key={index} className="h-12 w-full rounded-xl" />)}</CardContent></Card> :
      runsQuery.isError ? <Card><CardContent className="p-8 text-center"><p className="font-medium">Payroll runs couldn’t be loaded</p><Button className="mt-4" variant="outline" onClick={() => void runsQuery.refetch()}>Try again</Button></CardContent></Card> :
      !runs.length ? <Card className="shadow-soft"><CardContent className="p-10 text-center"><h2 className="font-semibold">No payroll runs yet</h2><p className="mt-2 text-sm text-muted-foreground">Choose ready people, check funding, and create your first run.</p><PayrollPermissionAction allowed={canPrepare} loading={capabilitiesQuery.isPending}><Button className="mt-5" variant="primary" asChild><Link href="/payroll/runs/new">Run payroll</Link></Button></PayrollPermissionAction></CardContent></Card> :
      <Card className="overflow-hidden shadow-soft"><Table><TableHeader><TableRow><TableHead>Run</TableHead><TableHead>Pay period</TableHead><TableHead>Payday</TableHead><TableHead>People</TableHead><TableHead>Total</TableHead><TableHead>Status</TableHead><TableHead>Created</TableHead></TableRow></TableHeader><TableBody>
        {runs.map((run) => <TableRow key={run.id}><TableCell><Link className="font-medium" href={`/payroll/runs/${run.id}`}>{String(run.metadata?.name || "Payroll run")}</Link></TableCell><TableCell>{run.payPeriodStart && run.payPeriodEnd ? `${formatDate(run.payPeriodStart)} – ${formatDate(run.payPeriodEnd)}` : "—"}</TableCell><TableCell>{run.payday ? formatDate(run.payday) : "—"}</TableCell><TableCell>{(run.lines?.length ?? Number(run.approvalSnapshot?.people.length ?? 0)) || "—"}</TableCell><TableCell className="tabular-nums">{formatCurrency(run.totalSource, run.sourceCurrency)}</TableCell><TableCell><PayrollRunStatusBadge status={run.status} /></TableCell><TableCell>{formatDate(run.createdAt)}</TableCell></TableRow>)}
      </TableBody></Table></Card>}
  </div>
}
