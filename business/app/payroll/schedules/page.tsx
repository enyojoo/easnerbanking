"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { CalendarDays, Eye, MoreHorizontal, Pause, Pencil, Play, Trash2 } from "lucide-react"
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
import { PayrollStatusBadge } from "@/components/payroll/payroll-status-badge"
import { usePayrollCapabilities, usePayrollSchedules } from "@/hooks/queries/use-payroll"
import { useDeletePayrollSchedule, useUpsertPayrollSchedule } from "@/hooks/mutations/use-payroll"
import { usePayrollListState } from "@/hooks/use-payroll-list-state"
import { formatDate } from "@/lib/utils"
import type { PayrollSchedule } from "@/lib/payroll/types"

type ScheduleFilter = "all" | "active" | "paused"
const SCHEDULE_FILTERS = ["all", "active", "paused"] as const

export default function PayrollSchedulesPage() {
  const schedulesQuery = usePayrollSchedules()
  const capabilitiesQuery = usePayrollCapabilities()
  const canPrepare = Boolean(capabilitiesQuery.data?.canPrepare)
  const allSchedules = useMemo(() => schedulesQuery.data ?? [], [schedulesQuery.data])
  const { query, filter, setQuery, setFilter, returnTo } = usePayrollListState<ScheduleFilter>({
    allowedFilters: SCHEDULE_FILTERS,
    defaultFilter: "all",
    filterParam: "status",
  })
  const counts = useMemo(() => ({
    all: allSchedules.length,
    active: allSchedules.filter((schedule) => schedule.active).length,
    paused: allSchedules.filter((schedule) => !schedule.active).length,
  }), [allSchedules])
  const schedules = useMemo(() => allSchedules.filter((schedule) => {
    const normalizedQuery = query.trim().toLowerCase()
    if (normalizedQuery && !schedule.name.toLowerCase().includes(normalizedQuery)) return false
    if (filter === "active") return schedule.active
    if (filter === "paused") return !schedule.active
    return true
  }), [allSchedules, filter, query])
  const deleteSchedule = useDeletePayrollSchedule()
  const updateSchedule = useUpsertPayrollSchedule()
  const [deleteTarget, setDeleteTarget] = useState<PayrollSchedule | null>(null)
  const [updatingScheduleIds, setUpdatingScheduleIds] = useState<Set<string>>(() => new Set())

  async function toggleSchedule(schedule: PayrollSchedule) {
    if (updatingScheduleIds.has(schedule.id)) return
    setUpdatingScheduleIds((current) => new Set(current).add(schedule.id))
    try {
      await updateSchedule.mutateAsync({ id: schedule.id, active: !schedule.active })
      toast.success(schedule.active ? "Schedule paused" : "Schedule reactivated")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Schedule could not be updated")
    } finally {
      setUpdatingScheduleIds((current) => {
        const next = new Set(current)
        next.delete(schedule.id)
        return next
      })
    }
  }
  return <>
    <PayrollListToolbar
      query={query}
      onQueryChange={setQuery}
      queryPlaceholder="Search schedules"
      filter={filter}
      onFilterChange={setFilter}
      label="Filter schedules"
      filters={[
        { value: "all", label: "All", count: counts.all },
        { value: "active", label: "Active", count: counts.active },
        { value: "paused", label: "Paused", count: counts.paused },
      ]}
    />
    {schedulesQuery.isPending && !schedulesQuery.data ? <Card className="shadow-soft"><CardContent className="space-y-3 p-5">{Array.from({ length: 4 }).map((_, index) => <Skeleton key={index} className="h-12 w-full rounded-xl" />)}</CardContent></Card> :
      schedulesQuery.isError ? <Card><CardContent className="p-8 text-center"><p className="font-medium">Payroll schedules couldn’t be loaded</p><Button className="mt-4" variant="outline" onClick={() => void schedulesQuery.refetch()}>Try again</Button></CardContent></Card> :
      !schedules.length ? <Card className="shadow-soft"><CardContent className="p-10 text-center"><CalendarDays className="mx-auto h-8 w-8 text-muted-foreground" /><h2 className="mt-4 font-semibold">{allSchedules.length ? "No schedules match this view" : "No payroll schedules"}</h2><p className="mt-2 text-sm text-muted-foreground">{allSchedules.length ? "Try another status or search." : "Create a payday-centered schedule for recurring payroll."}</p>{!allSchedules.length ? <PayrollPermissionAction allowed={canPrepare} loading={capabilitiesQuery.isPending}><Button className="mt-5" variant="primary" asChild><Link href="/payroll/schedules/new">Create schedule</Link></Button></PayrollPermissionAction> : null}</CardContent></Card> :
      <><Card className="hidden overflow-hidden shadow-soft md:block"><Table><TableHeader><TableRow><TableHead>Schedule</TableHead><TableHead>Frequency</TableHead><TableHead>Next payday</TableHead><TableHead>People</TableHead><TableHead>Status</TableHead><TableHead className="w-12"><span className="sr-only">Actions</span></TableHead></TableRow></TableHeader><TableBody>{schedules.map((schedule) => <TableRow key={schedule.id}><TableCell><Link className="font-medium hover:underline" href={`/payroll/schedules/${schedule.id}?returnTo=${encodeURIComponent(returnTo)}`}>{schedule.name}</Link><span className="mt-0.5 block text-xs text-muted-foreground">Recurring payroll</span></TableCell><TableCell className="capitalize">{schedule.frequency === "semimonthly" ? "Twice monthly" : schedule.frequency}</TableCell><TableCell>{formatDate(schedule.nextRunAt)}</TableCell><TableCell>{schedule.personIds?.length ?? 0}</TableCell><TableCell><PayrollStatusBadge status={schedule.active ? "active" : "held"} /></TableCell><TableCell><ScheduleActions schedule={schedule} returnTo={returnTo} canPrepare={canPrepare} pending={updatingScheduleIds.has(schedule.id)} onToggle={() => void toggleSchedule(schedule)} onDelete={() => setDeleteTarget(schedule)} /></TableCell></TableRow>)}</TableBody></Table></Card>
      <div className="space-y-3 md:hidden">{schedules.map((schedule) => <Card key={schedule.id} className="shadow-soft"><CardContent className="p-4">
        <div className="flex items-start justify-between gap-3"><div className="min-w-0"><Link className="block truncate font-medium" href={`/payroll/schedules/${schedule.id}?returnTo=${encodeURIComponent(returnTo)}`}>{schedule.name}</Link><p className="mt-1 text-xs capitalize text-muted-foreground">{schedule.frequency === "semimonthly" ? "Twice monthly" : schedule.frequency}</p></div><ScheduleActions schedule={schedule} returnTo={returnTo} canPrepare={canPrepare} pending={updatingScheduleIds.has(schedule.id)} onToggle={() => void toggleSchedule(schedule)} onDelete={() => setDeleteTarget(schedule)} /></div>
        <dl className="mt-4 grid grid-cols-2 gap-3 border-t pt-4 text-sm"><div><dt className="text-xs text-muted-foreground">Next payday</dt><dd className="mt-1">{formatDate(schedule.nextRunAt)}</dd></div><div><dt className="text-xs text-muted-foreground">People</dt><dd className="mt-1">{schedule.personIds?.length ?? 0}</dd></div><div className="col-span-2 flex items-center justify-between"><dt className="text-xs text-muted-foreground">Status</dt><dd><PayrollStatusBadge status={schedule.active ? "active" : "held"} /></dd></div></dl>
      </CardContent></Card>)}</div></>}
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
    <PayrollInlineRefreshing visible={schedulesQuery.isFetching && !schedulesQuery.isPending} />
  </>
}

function ScheduleActions({
  schedule,
  returnTo,
  canPrepare,
  pending,
  onToggle,
  onDelete,
}: {
  schedule: PayrollSchedule
  returnTo: string
  canPrepare: boolean
  pending: boolean
  onToggle: () => void
  onDelete: () => void
}) {
  return <DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="min-h-11 min-w-11" aria-label={`Actions for ${schedule.name}`}><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger><DropdownMenuContent align="end">
    <DropdownMenuItem asChild><Link href={`/payroll/schedules/${schedule.id}?returnTo=${encodeURIComponent(returnTo)}`}><Eye />View details</Link></DropdownMenuItem>
    {canPrepare ? <DropdownMenuItem asChild><Link href={`/payroll/schedules/${schedule.id}/edit`}><Pencil />Edit schedule</Link></DropdownMenuItem> : null}
    {canPrepare ? <DropdownMenuItem disabled={pending} onClick={onToggle}>{schedule.active ? <Pause /> : <Play />}{pending ? "Updating…" : schedule.active ? "Pause schedule" : "Reactivate schedule"}</DropdownMenuItem> : null}
    {canPrepare ? <><DropdownMenuSeparator /><DropdownMenuItem variant="destructive" onClick={onDelete}><Trash2 />Delete schedule</DropdownMenuItem></> : null}
  </DropdownMenuContent></DropdownMenu>
}
