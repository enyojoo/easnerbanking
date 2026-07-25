"use client"

import Link from "next/link"
import { CalendarDays, Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { PayrollNavTabs } from "@/components/payroll/payroll-nav-tabs"
import { PayrollPageHeader } from "@/components/payroll/payroll-page-header"
import { PayrollPermissionAction } from "@/components/payroll/payroll-permission-action"
import { PayrollStatusBadge } from "@/components/payroll/payroll-status-badge"
import { usePayrollCapabilities, usePayrollSchedules, usePayrollSettings } from "@/hooks/queries/use-payroll"
import { formatDate } from "@/lib/utils"

export default function PayrollSchedulesPage() {
  const schedulesQuery = usePayrollSchedules()
  const capabilitiesQuery = usePayrollCapabilities()
  const canPrepare = Boolean(capabilitiesQuery.data?.canPrepare)
  const payrollCurrency = usePayrollSettings().data?.defaultCurrency || "USD"
  const schedules = schedulesQuery.data ?? []
  return <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
    <PayrollPageHeader title="Schedules" description="Plan recurring paydays, preparation deadlines, funding reminders, and included people." actions={<PayrollPermissionAction allowed={canPrepare} loading={capabilitiesQuery.isPending}><Button variant="primary" asChild><Link href="/payroll/schedules/new"><Plus className="mr-2 h-4 w-4" />Create schedule</Link></Button></PayrollPermissionAction>} />
    <PayrollNavTabs />
    {schedulesQuery.isPending ? <Card className="shadow-soft"><CardContent className="space-y-3 p-5">{Array.from({ length: 4 }).map((_, index) => <Skeleton key={index} className="h-12 w-full rounded-xl" />)}</CardContent></Card> :
      schedulesQuery.isError ? <Card><CardContent className="p-8 text-center"><p className="font-medium">Payroll schedules couldn’t be loaded</p><Button className="mt-4" variant="outline" onClick={() => void schedulesQuery.refetch()}>Try again</Button></CardContent></Card> :
      !schedules.length ? <Card className="shadow-soft"><CardContent className="p-10 text-center"><CalendarDays className="mx-auto h-8 w-8 text-muted-foreground" /><h2 className="mt-4 font-semibold">No payroll schedules</h2><p className="mt-2 text-sm text-muted-foreground">Create a payday-centered schedule to prepare recurring payroll drafts.</p><PayrollPermissionAction allowed={canPrepare} loading={capabilitiesQuery.isPending}><Button className="mt-5" variant="primary" asChild><Link href="/payroll/schedules/new">Create schedule</Link></Button></PayrollPermissionAction></CardContent></Card> :
      <Card className="overflow-hidden shadow-soft"><Table><TableHeader><TableRow><TableHead>Schedule</TableHead><TableHead>Frequency</TableHead><TableHead>Next payday</TableHead><TableHead>People</TableHead><TableHead>Source</TableHead><TableHead>Status</TableHead></TableRow></TableHeader><TableBody>{schedules.map((schedule) => <TableRow key={schedule.id}><TableCell><Link className="font-medium" href={`/payroll/schedules/${schedule.id}`}>{schedule.name}</Link></TableCell><TableCell className="capitalize">{schedule.frequency === "semimonthly" ? "Twice monthly" : schedule.frequency}</TableCell><TableCell>{formatDate(schedule.nextRunAt)}</TableCell><TableCell>{schedule.personIds?.length ?? 0}</TableCell><TableCell>{payrollCurrency} account</TableCell><TableCell><PayrollStatusBadge status={schedule.active ? "active" : "held"} /></TableCell></TableRow>)}</TableBody></Table></Card>}
  </div>
}
