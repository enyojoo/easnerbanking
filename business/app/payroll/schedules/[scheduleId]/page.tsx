"use client"

import Link from "next/link"
import { useParams, useRouter } from "next/navigation"
import { ArrowLeft, Pencil } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { PayrollDeleteAction } from "@/components/payroll/payroll-delete-action"
import { PayrollPageHeader } from "@/components/payroll/payroll-page-header"
import { PayrollStatusBadge } from "@/components/payroll/payroll-status-badge"
import { useDeletePayrollSchedule } from "@/hooks/mutations/use-payroll"
import { usePayrollCapabilities, usePayrollPeople, usePayrollSchedules } from "@/hooks/queries/use-payroll"
import { formatDate } from "@/lib/utils"

export default function PayrollScheduleDetailPage() {
  const { scheduleId } = useParams<{ scheduleId: string }>()
  const router = useRouter()
  const schedulesQuery = usePayrollSchedules()
  const peopleQuery = usePayrollPeople()
  const capabilities = usePayrollCapabilities().data
  const deleteSchedule = useDeletePayrollSchedule()
  const schedule = schedulesQuery.data?.find((item) => item.id === scheduleId)
  if (schedulesQuery.isPending || peopleQuery.isPending) return <div className="mx-auto max-w-6xl px-4 py-12 text-sm text-muted-foreground">Loading schedule…</div>
  if (!schedule) return <div className="mx-auto max-w-6xl px-4 py-12"><p className="font-medium">Schedule not found.</p><Button className="mt-4" variant="outline" asChild><Link href="/payroll/schedules">Back to Schedules</Link></Button></div>
  const template = schedule.template ?? {}
  const includedPeople = (peopleQuery.data ?? []).filter((person) => schedule.personIds?.includes(person.id))
  const frequency = schedule.frequency === "semimonthly" ? "Twice monthly" : schedule.frequency.replace(/^\w/, (character) => character.toUpperCase())
  const weekendPolicy = template.weekendPolicy === "next_business_day" ? "Next business day" : "Previous business day"
  const canPrepare = Boolean(capabilities?.canPrepare)

  return <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
    <Button variant="ghost" size="sm" className="mb-4" asChild><Link href="/payroll/schedules"><ArrowLeft className="mr-2 h-4 w-4" />Back to Schedules</Link></Button>
    <PayrollPageHeader
      title={schedule.name}
      description="Recurring payday, preparation, funding, and included-person details."
      actions={canPrepare ? <>
        <Button variant="outline" asChild><Link href={`/payroll/schedules/${schedule.id}/edit`}><Pencil className="mr-2 h-4 w-4" />Edit schedule</Link></Button>
        <PayrollDeleteAction label="Delete schedule" title={`Delete ${schedule.name}?`} description="This permanently removes the recurring schedule. Existing payroll runs and payment history are kept." pending={deleteSchedule.isPending} onDelete={async () => {
          try {
            await deleteSchedule.mutateAsync(schedule.id)
            toast.success("Schedule deleted")
            router.push("/payroll/schedules")
          } catch (error) {
            toast.error(error instanceof Error ? error.message : "Schedule could not be deleted")
          }
        }} />
      </> : undefined}
    />
    <Card className="shadow-card"><CardContent className="space-y-7 p-6">
        <section>
          <div className="flex items-center justify-between"><h2 className="font-semibold">Schedule details</h2><PayrollStatusBadge status={schedule.active ? "active" : "held"} /></div>
          <dl className="mt-5 grid gap-5 sm:grid-cols-2">
            <Detail label="Name" value={schedule.name} />
            <Detail label="First payday" value={formatDate(schedule.nextRunAt)} />
            <Detail label="Frequency" value={frequency} />
            <Detail label="Weekend & holiday handling" value={weekendPolicy} />
          </dl>
        </section>
        <section className="border-t pt-6">
          <h2 className="font-semibold">Preparation timeline</h2>
          <dl className="mt-5 grid gap-5 sm:grid-cols-3">
            <Detail label="Draft preparation" value={`${Number(template.draftLeadDays ?? 5)} days before payday`} />
            <Detail label="Approval deadline" value={`${Number(template.approvalLeadDays ?? 2)} days before payday`} />
            <Detail label="Funding reminder" value={`${Number(template.fundingReminderDays ?? 3)} days before payday`} />
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
                  <Link
                    key={person.id}
                    href={`/payroll/people/${person.id}`}
                    className="flex min-w-0 items-center justify-between gap-3 bg-card p-3 text-sm hover:bg-muted"
                  >
                    <span className="truncate font-medium">{person.fullName}</span>
                    <span className="shrink-0 capitalize text-muted-foreground">{person.type}</span>
                  </Link>
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
  </div>
}

function Detail({ label, value }: { label: string; value: string }) {
  return <div><dt className="text-xs text-muted-foreground">{label}</dt><dd className="mt-1 text-sm">{value}</dd></div>
}
