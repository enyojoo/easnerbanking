"use client"

import Link from "next/link"
import { useParams, useRouter } from "next/navigation"
import { ArrowLeft } from "lucide-react"
import { Button } from "@/components/ui/button"
import { PayrollPageHeader } from "@/components/payroll/payroll-page-header"
import { PayrollScheduleForm } from "@/components/payroll/payroll-schedule-form"
import { PayrollDeleteAction } from "@/components/payroll/payroll-delete-action"
import { PayrollNavTabs } from "@/components/payroll/payroll-nav-tabs"
import { usePayrollSchedules } from "@/hooks/queries/use-payroll"
import { useDeletePayrollSchedule } from "@/hooks/mutations/use-payroll"
import { toast } from "sonner"

export default function PayrollScheduleDetailPage() {
  const { scheduleId } = useParams<{ scheduleId: string }>()
  const router = useRouter()
  const query = usePayrollSchedules()
  const deleteSchedule = useDeletePayrollSchedule()
  const schedule = query.data?.find((item) => item.id === scheduleId)
  if (query.isPending) return <div className="mx-auto max-w-6xl px-4 py-12 text-sm text-muted-foreground">Loading schedule…</div>
  if (!schedule) return <div className="mx-auto max-w-6xl px-4 py-12">Schedule not found.</div>
  return <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6"><Button variant="ghost" size="sm" className="mb-4" asChild><Link href="/payroll/schedules"><ArrowLeft className="mr-2 h-4 w-4" />Back to Schedules</Link></Button><PayrollPageHeader title={schedule.name} description="Update payday rules, preparation timing, funding, and included people." actions={<PayrollDeleteAction label="Delete schedule" title={`Delete ${schedule.name}?`} description="This permanently removes the recurring schedule. Existing payroll runs and payment history are kept." pending={deleteSchedule.isPending} onDelete={() => deleteSchedule.mutateAsync(schedule.id).then(() => { toast.success("Schedule deleted"); router.push("/payroll/schedules") }).catch((error) => toast.error(error.message))} />} /><PayrollNavTabs /><PayrollScheduleForm schedule={schedule} /></div>
}
