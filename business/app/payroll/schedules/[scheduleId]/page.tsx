"use client"

import Link from "next/link"
import { useParams } from "next/navigation"
import { ArrowLeft } from "lucide-react"
import { Button } from "@/components/ui/button"
import { PayrollPageHeader } from "@/components/payroll/payroll-page-header"
import { PayrollScheduleForm } from "@/components/payroll/payroll-schedule-form"
import { usePayrollSchedules } from "@/hooks/queries/use-payroll"

export default function PayrollScheduleDetailPage() {
  const { scheduleId } = useParams<{ scheduleId: string }>()
  const query = usePayrollSchedules()
  const schedule = query.data?.find((item) => item.id === scheduleId)
  if (query.isPending) return <div className="mx-auto max-w-6xl px-4 py-12 text-sm text-muted-foreground">Loading schedule…</div>
  if (!schedule) return <div className="mx-auto max-w-6xl px-4 py-12">Schedule not found.</div>
  return <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6"><Button variant="ghost" size="sm" className="mb-4" asChild><Link href="/payroll/schedules"><ArrowLeft className="mr-2 h-4 w-4" />Back to Schedules</Link></Button><PayrollPageHeader title={schedule.name} description="Update payday rules, preparation timing, funding, and included people." /><PayrollScheduleForm schedule={schedule} /></div>
}
