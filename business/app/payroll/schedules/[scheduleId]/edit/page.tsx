"use client"

import Link from "next/link"
import { useParams } from "next/navigation"
import { ArrowLeft } from "lucide-react"
import { Button } from "@/components/ui/button"
import { PayrollPageHeader } from "@/components/payroll/payroll-page-header"
import { PayrollScheduleForm } from "@/components/payroll/payroll-schedule-form"
import { usePayrollSchedules } from "@/hooks/queries/use-payroll"

export default function EditPayrollSchedulePage() {
  const { scheduleId } = useParams<{ scheduleId: string }>()
  const query = usePayrollSchedules()
  const schedule = query.data?.find((item) => item.id === scheduleId)
  if (query.isPending) return <div className="mx-auto max-w-6xl px-4 py-12 text-sm text-muted-foreground">Loading schedule…</div>
  if (!schedule) return <div className="mx-auto max-w-6xl px-4 py-12"><p className="font-medium">Schedule not found.</p><Button className="mt-4" variant="outline" asChild><Link href="/payroll/schedules">Back to Schedules</Link></Button></div>
  return <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6"><Button variant="ghost" size="sm" className="mb-4" asChild><Link href={`/payroll/schedules/${schedule.id}`}><ArrowLeft className="mr-2 h-4 w-4" />Back to schedule</Link></Button><PayrollPageHeader title="Edit schedule" description="Update payday rules, preparation timing, funding, and included people." /><PayrollScheduleForm schedule={schedule} /></div>
}
