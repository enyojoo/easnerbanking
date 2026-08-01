"use client"

import { useState } from "react"
import Link from "next/link"
import { useParams, useRouter, useSearchParams } from "next/navigation"
import { MoreHorizontal, Pause, Pencil, Play, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { PayrollDeleteDialog } from "@/components/payroll/payroll-delete-dialog"
import { PayrollSubpageShell } from "@/components/payroll/payroll-subpage-shell"
import { PayrollStatusBadge } from "@/components/payroll/payroll-status-badge"
import { PayrollDetailSkeleton, PayrollInlineRefreshing } from "@/components/payroll/payroll-page-skeleton"
import { PayrollDetailLink } from "@/components/payroll/payroll-detail-link"
import { useDeletePayrollSchedule, useUpsertPayrollSchedule } from "@/hooks/mutations/use-payroll"
import { usePayrollCapabilities, usePayrollPeople, usePayrollSchedules } from "@/hooks/queries/use-payroll"
import { formatDate } from "@/lib/utils"
import { safePayrollReturnTo } from "@/lib/payroll/navigation"
import { PAYROLL_SUBPAGE_COPY } from "@/lib/copy/business-ui-copy"

export default function PayrollScheduleDetailPage() {
  const { scheduleId } = useParams<{ scheduleId: string }>()
  const router = useRouter()
  const searchParams = useSearchParams()
  const returnTo = safePayrollReturnTo(searchParams.get("returnTo"), "/payroll/schedules")
  const schedulesQuery = usePayrollSchedules()
  const peopleQuery = usePayrollPeople()
  const capabilities = usePayrollCapabilities().data
  const deleteSchedule = useDeletePayrollSchedule()
  const updateSchedule = useUpsertPayrollSchedule()
  const [deleteOpen, setDeleteOpen] = useState(false)
  const schedule = schedulesQuery.data?.find((item) => item.id === scheduleId)
  if ((schedulesQuery.isPending && !schedule) || (peopleQuery.isPending && !peopleQuery.data)) {
    return <PayrollDetailSkeleton sidebar={false} />
  }
  if (!schedule) return <div className="mx-auto max-w-6xl px-4 py-12"><p className="font-medium">Schedule not found.</p><Button className="mt-4" variant="outline" asChild><Link href="/payroll/schedules">Back to Schedules</Link></Button></div>
  const template = schedule.template ?? {}
  const includedPeople = (peopleQuery.data ?? []).filter((person) => schedule.personIds?.includes(person.id))
  const frequency = schedule.frequency === "semimonthly" ? "Twice monthly" : schedule.frequency.replace(/^\w/, (character) => character.toUpperCase())
  const weekendPolicy = template.weekendPolicy === "next_business_day" ? "Next business day" : "Previous business day"
  const canPrepare = Boolean(capabilities?.canPrepare)

  return <PayrollSubpageShell
      backHref={returnTo}
      backLabel="Back to Schedules"
      section="Schedules"
      current={schedule.name}
      title={schedule.name}
      description={PAYROLL_SUBPAGE_COPY.scheduleDetail}
      status={<PayrollStatusBadge status={schedule.active ? "active" : "held"} />}
      actions={canPrepare ? (
        <div className="flex shrink-0 items-center gap-2 overflow-x-auto">
          <Button variant="outline" asChild>
            <Link href={`/payroll/schedules/${schedule.id}/edit`}>
              <Pencil className="mr-2 h-4 w-4" />Edit
            </Link>
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon" aria-label={`More actions for ${schedule.name}`}>
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onClick={() => updateSchedule.mutate(
                  { id: schedule.id, active: !schedule.active },
                  {
                    onSuccess: () => toast.success(schedule.active ? "Schedule paused" : "Schedule reactivated"),
                    onError: (error) => toast.error(error.message),
                  },
                )}
              >
                {schedule.active ? <Pause /> : <Play />}
                {schedule.active ? "Pause schedule" : "Reactivate schedule"}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onClick={() => setDeleteOpen(true)}>
                <Trash2 />Delete schedule
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      ) : undefined}
    >
    <Card className="shadow-card"><CardContent className="space-y-7 p-6">
        <section>
          <h2 className="font-semibold">Schedule details</h2>
          <dl className="mt-5 grid gap-5 sm:grid-cols-2">
            <Detail label="Name" value={schedule.name} />
            <Detail label="First payday" value={formatDate(schedule.nextRunAt)} />
            <Detail label="Frequency" value={frequency} />
            <Detail label="Weekend handling" value={weekendPolicy} />
          </dl>
        </section>
        <section className="border-t pt-6">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <h2 className="font-semibold">Included people</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {includedPeople.length} {includedPeople.length === 1 ? "person" : "people"} in this schedule.
              </p>
            </div>
            {canPrepare ? (
              <Button variant="outline" size="sm" asChild>
                <Link href={`/payroll/schedules/${schedule.id}/edit`}>Manage people</Link>
              </Button>
            ) : null}
          </div>
          {includedPeople.length ? (
            <div className="mt-4 max-h-96 overflow-y-auto rounded-xl border bg-border">
              <div className="grid gap-px sm:grid-cols-2">
                {includedPeople.map((person) => (
                  <PayrollDetailLink
                    key={person.id}
                    kind="person"
                    id={person.id}
                    href={`/payroll/people/${person.id}`}
                    className="flex min-w-0 items-center justify-between gap-3 bg-card p-3 text-sm hover:bg-muted"
                  >
                    <span className="truncate font-medium">{person.fullName}</span>
                    <span className="shrink-0 capitalize text-muted-foreground">{person.type}</span>
                  </PayrollDetailLink>
                ))}
              </div>
            </div>
          ) : (
            <p className="mt-4 rounded-xl bg-muted/40 p-4 text-sm text-muted-foreground">
              No people have been added to this schedule.
            </p>
          )}
        </section>
      </CardContent></Card>
    <PayrollDeleteDialog
      open={deleteOpen}
      onOpenChange={setDeleteOpen}
      title={`Delete ${schedule.name}?`}
      description="This permanently removes the recurring schedule. Existing payroll runs and payment history are kept."
      label="Delete schedule"
      pending={deleteSchedule.isPending}
      onDelete={async () => {
        try {
          await deleteSchedule.mutateAsync(schedule.id)
          toast.success("Schedule deleted")
          router.push("/payroll/schedules")
        } catch (error) {
          toast.error(error instanceof Error ? error.message : "Schedule could not be deleted")
          throw error
        }
      }}
    />
    <PayrollInlineRefreshing
      visible={(schedulesQuery.isFetching && !schedulesQuery.isPending) || (peopleQuery.isFetching && !peopleQuery.isPending)}
    />
  </PayrollSubpageShell>
}

function Detail({ label, value }: { label: string; value: string }) {
  return <div><dt className="text-xs text-muted-foreground">{label}</dt><dd className="mt-1 text-sm">{value}</dd></div>
}
