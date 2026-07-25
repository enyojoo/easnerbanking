"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { PayrollNavTabs } from "@/components/payroll/payroll-nav-tabs"
import { PayrollLegalNote } from "@/components/payroll/payroll-legal-note"
import { usePayrollSchedules } from "@/hooks/queries/use-payroll"
import { useUpsertPayrollSchedule } from "@/hooks/mutations/use-payroll"
import { formatDate } from "@/lib/utils"
import { toast } from "sonner"
import type { PayrollScheduleFrequency } from "@/lib/payroll/types"

export default function PayrollSchedulesPage() {
  const schedulesQuery = usePayrollSchedules()
  const upsertSchedule = useUpsertPayrollSchedule()

  const [name, setName] = useState("Monthly payroll")
  const [frequency, setFrequency] = useState<PayrollScheduleFrequency>("monthly")
  const [nextRunAt, setNextRunAt] = useState(new Date().toISOString().slice(0, 10))

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Schedules</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Auto-draft payroll runs on a recurring date. Approval is still required before pay.
        </p>
      </div>

      <PayrollNavTabs />

      <Card className="shadow-card mb-6">
        <CardContent className="p-6 space-y-4">
          <h2 className="text-sm font-medium">Create schedule</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Frequency</Label>
              <Select value={frequency} onValueChange={(v) => setFrequency(v as PayrollScheduleFrequency)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="weekly">Weekly</SelectItem>
                  <SelectItem value="biweekly">Biweekly</SelectItem>
                  <SelectItem value="semimonthly">Twice monthly</SelectItem>
                  <SelectItem value="monthly">Monthly</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Next run</Label>
              <Input type="date" value={nextRunAt} onChange={(e) => setNextRunAt(e.target.value)} />
            </div>
          </div>
          <Button
            variant="primary"
            onClick={() =>
              upsertSchedule.mutate(
                { name, frequency, nextRunAt, active: true },
                {
                  onSuccess: () => toast.success("Schedule saved"),
                  onError: (e) => toast.error(e.message),
                },
              )
            }
            disabled={upsertSchedule.isPending}
          >
            Save schedule
          </Button>
        </CardContent>
      </Card>

      <div className="space-y-3">
        {(schedulesQuery.data ?? []).map((schedule) => (
          <Card key={schedule.id} className="shadow-soft">
            <CardContent className="p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <p className="font-medium">{schedule.name}</p>
                <p className="text-sm text-muted-foreground">
                  {schedule.frequency} · Next {formatDate(schedule.nextRunAt)}
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  upsertSchedule.mutate(
                    { id: schedule.id, active: !schedule.active },
                    { onSuccess: () => toast.success(schedule.active ? "Paused" : "Activated") },
                  )
                }
              >
                {schedule.active ? "Pause" : "Activate"}
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>

      <PayrollLegalNote className="mt-8" />
    </div>
  )
}
