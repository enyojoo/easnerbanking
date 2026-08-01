"use client"

import { useParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import Link from "next/link"
import { PayrollScheduleForm } from "@/components/payroll/payroll-schedule-form"
import { PayrollSubpageShell } from "@/components/payroll/payroll-subpage-shell"
import { PayrollFormSkeleton } from "@/components/payroll/payroll-page-skeleton"
import { usePayrollSchedules } from "@/hooks/queries/use-payroll"

export default function EditPayrollSchedulePage() {
  const { scheduleId } = useParams<{ scheduleId: string }>()
  const query = usePayrollSchedules()
  const schedule = query.data?.find((item) => item.id === scheduleId)
  if (query.isPending && !schedule) return <PayrollFormSkeleton />
  if (!schedule) return <div className="mx-auto max-w-6xl px-4 pb-12"><p className="font-medium">Schedule not found.</p><Button className="mt-4" variant="outline" asChild><Link href="/payroll/schedules">Back to Schedules</Link></Button></div>
  return (
    <PayrollSubpageShell
      backHref={`/payroll/schedules/${schedule.id}`}
      backLabel="Back to schedule"
      section="Schedules"
      current={schedule.name}
      title="Edit schedule"
      description="Update payday rules and the people included in this schedule."
    >
      <PayrollScheduleForm schedule={schedule} />
    </PayrollSubpageShell>
  )
}
