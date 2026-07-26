import { PayrollScheduleForm } from "@/components/payroll/payroll-schedule-form"
import { PayrollSubpageShell } from "@/components/payroll/payroll-subpage-shell"

export default function NewPayrollSchedulePage() {
  return (
    <PayrollSubpageShell
      backHref="/payroll/schedules"
      backLabel="Back to Schedules"
      section="Schedules"
      current="Create"
      title="Create schedule"
      description="Define recurring paydays and choose the people to include."
    >
      <PayrollScheduleForm />
    </PayrollSubpageShell>
  )
}
