"use client"

import { useState } from "react"
import Link from "next/link"
import { CalendarDays, Eye, MoreHorizontal, Pause, Pencil, Play, Plus, Trash2 } from "lucide-react"
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
import { PayrollStatusBadge } from "@/components/payroll/payroll-status-badge"
import { usePayrollCapabilities, usePayrollSchedules } from "@/hooks/queries/use-payroll"
import { useDeletePayrollSchedule, useUpsertPayrollSchedule } from "@/hooks/mutations/use-payroll"
import { formatDate } from "@/lib/utils"
import type { PayrollSchedule } from "@/lib/payroll/types"

export default function PayrollSchedulesPage() {
  const schedulesQuery = usePayrollSchedules()
  const capabilitiesQuery = usePayrollCapabilities()
  const canPrepare = Boolean(capabilitiesQuery.data?.canPrepare)
  const schedules = schedulesQuery.data ?? []
  const deleteSchedule = useDeletePayrollSchedule()
  const updateSchedule = useUpsertPayrollSchedule()
  const [deleteTarget, setDeleteTarget] = useState<PayrollSchedule | null>(null)
  return <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
    <PayrollPageHeader title="Schedules" description="Plan recurring paydays, preparation deadlines, funding reminders, and included people." actions={<PayrollPermissionAction allowed={canPrepare} loading={capabilitiesQuery.isPending}><Button variant="primary" asChild><Link href="/payroll/schedules/new"><Plus className="mr-2 h-4 w-4" />Create schedule</Link></Button></PayrollPermissionAction>} />
    <PayrollNavTabs />
    {schedulesQuery.isPending ? <Card className="shadow-soft"><CardContent className="space-y-3 p-5">{Array.from({ length: 4 }).map((_, index) => <Skeleton key={index} className="h-12 w-full rounded-xl" />)}</CardContent></Card> :
      schedulesQuery.isError ? <Card><CardContent className="p-8 text-center"><p className="font-medium">Payroll schedules couldn’t be loaded</p><Button className="mt-4" variant="outline" onClick={() => void schedulesQuery.refetch()}>Try again</Button></CardContent></Card> :
      !schedules.length ? <Card className="shadow-soft"><CardContent className="p-10 text-center"><CalendarDays className="mx-auto h-8 w-8 text-muted-foreground" /><h2 className="mt-4 font-semibold">No payroll schedules</h2><p className="mt-2 text-sm text-muted-foreground">Create a payday-centered schedule to prepare recurring payroll drafts.</p><PayrollPermissionAction allowed={canPrepare} loading={capabilitiesQuery.isPending}><Button className="mt-5" variant="primary" asChild><Link href="/payroll/schedules/new">Create schedule</Link></Button></PayrollPermissionAction></CardContent></Card> :
      <Card className="overflow-hidden shadow-soft"><Table><TableHeader><TableRow><TableHead>Schedule</TableHead><TableHead>Frequency</TableHead><TableHead>Next payday</TableHead><TableHead>People</TableHead><TableHead>Status</TableHead><TableHead className="w-12"><span className="sr-only">Actions</span></TableHead></TableRow></TableHeader><TableBody>{schedules.map((schedule) => <TableRow key={schedule.id}><TableCell><Link className="font-medium hover:underline" href={`/payroll/schedules/${schedule.id}`}>{schedule.name}</Link><span className="mt-0.5 block text-xs text-muted-foreground">Recurring payroll</span></TableCell><TableCell className="capitalize">{schedule.frequency === "semimonthly" ? "Twice monthly" : schedule.frequency}</TableCell><TableCell>{formatDate(schedule.nextRunAt)}</TableCell><TableCell>{schedule.personIds?.length ?? 0}</TableCell><TableCell><PayrollStatusBadge status={schedule.active ? "active" : "held"} /></TableCell><TableCell>
        <DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon" aria-label={`Actions for ${schedule.name}`}><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger><DropdownMenuContent align="end">
          <DropdownMenuItem asChild><Link href={`/payroll/schedules/${schedule.id}`}><Eye />View details</Link></DropdownMenuItem>
          {canPrepare ? <DropdownMenuItem asChild><Link href={`/payroll/schedules/${schedule.id}/edit`}><Pencil />Edit schedule</Link></DropdownMenuItem> : null}
          {canPrepare ? <DropdownMenuItem onClick={() => updateSchedule.mutate({ id: schedule.id, active: !schedule.active }, {
            onSuccess: () => toast.success(schedule.active ? "Schedule paused" : "Schedule reactivated"),
            onError: (error) => toast.error(error.message),
          })}>{schedule.active ? <Pause /> : <Play />}{schedule.active ? "Pause schedule" : "Reactivate schedule"}</DropdownMenuItem> : null}
          {canPrepare ? <><DropdownMenuSeparator /><DropdownMenuItem variant="destructive" onClick={() => setDeleteTarget(schedule)}><Trash2 />Delete schedule</DropdownMenuItem></> : null}
        </DropdownMenuContent></DropdownMenu>
      </TableCell></TableRow>)}</TableBody></Table></Card>}
    <PayrollDeleteDialog
      open={Boolean(deleteTarget)}
      onOpenChange={(open) => !open && setDeleteTarget(null)}
      title={deleteTarget ? `Delete ${deleteTarget.name}?` : "Delete schedule?"}
      description="This permanently removes the recurring schedule. Existing payroll runs and payment history are kept."
      label="Delete schedule"
      pending={deleteSchedule.isPending}
      onDelete={async () => {
        if (!deleteTarget) return
        try {
          await deleteSchedule.mutateAsync(deleteTarget.id)
          toast.success("Schedule deleted")
        } catch (error) {
          toast.error(error instanceof Error ? error.message : "Schedule could not be deleted")
          throw error
        }
      }}
    />
  </div>
}
