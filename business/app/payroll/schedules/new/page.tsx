import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { Button } from "@/components/ui/button"
import { PayrollPageHeader } from "@/components/payroll/payroll-page-header"
import { PayrollNavTabs } from "@/components/payroll/payroll-nav-tabs"
import { PayrollScheduleForm } from "@/components/payroll/payroll-schedule-form"

export default function NewPayrollSchedulePage() {
  return <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6"><Button variant="ghost" size="sm" className="mb-4" asChild><Link href="/payroll/schedules"><ArrowLeft className="mr-2 h-4 w-4" />Back to Schedules</Link></Button><PayrollPageHeader title="Create schedule" description="Define recurring paydays and when your team prepares, approves, and funds payroll." /><PayrollNavTabs /><PayrollScheduleForm /></div>
}
