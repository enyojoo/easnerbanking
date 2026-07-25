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
import { usePayrollCapabilities, usePayrollSchedules } from "@/hooks/queries/use-payroll"
import { useUpsertPayrollSchedule } from "@/hooks/mutations/use-payroll"
import { formatDate } from "@/lib/utils"
import { toast } from "sonner"
import type { PayrollScheduleFrequency } from "@/lib/payroll/types"

export default function PayrollSchedulesPage() {
  const schedulesQuery = usePayrollSchedules()
  const capabilities = usePayrollCapabilities().data
  const canPrepare = Boolean(capabilities?.enabled && capabilities.canPrepare)
  const upsertSchedule = useUpsertPayrollSchedule()

  const [name, setName] = useState("Monthly payroll")
  const [frequency, setFrequency] = useState<PayrollScheduleFrequency>("monthly")
  const [nextRunAt, setNextRunAt] = useState(new Date().toISOString().slice(0, 10))
  const [timezone, setTimezone] = useState("UTC")
  const [draftLeadDays, setDraftLeadDays] = useState("5")
  const [approvalLeadDays, setApprovalLeadDays] = useState("2")
  const [weekendPolicy, setWeekendPolicy] = useState<"previous_business_day" | "next_business_day">("previous_business_day")
  const [sourceCurrency, setSourceCurrency] = useState("USD")

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Schedules</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Auto-draft payroll runs on a recurring date. Approval is still required before pay.
        </p>
      </div>

      <PayrollNavTabs />

      {canPrepare ? <Card className="shadow-card mb-6">
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
              <Label>Next payday</Label>
              <Input type="date" value={nextRunAt} onChange={(e) => setNextRunAt(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Business timezone</Label>
              <Input value={timezone} onChange={(e) => setTimezone(e.target.value)} placeholder="Africa/Lagos" />
            </div>
            <div className="space-y-2">
              <Label>Draft lead days</Label>
              <Input inputMode="numeric" value={draftLeadDays} onChange={(e) => setDraftLeadDays(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Approval lead days</Label>
              <Input inputMode="numeric" value={approvalLeadDays} onChange={(e) => setApprovalLeadDays(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Weekend handling</Label>
              <Select value={weekendPolicy} onValueChange={(v) => setWeekendPolicy(v as typeof weekendPolicy)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="previous_business_day">Pay previous business day</SelectItem>
                  <SelectItem value="next_business_day">Pay next business day</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Source currency</Label>
              <Input value={sourceCurrency} onChange={(e) => setSourceCurrency(e.target.value.toUpperCase())} />
            </div>
          </div>
          <Button
            variant="primary"
            onClick={() =>
              upsertSchedule.mutate(
                {
                  name, frequency, nextRunAt, active: true, timezone,
                  draftLeadDays: Number(draftLeadDays), approvalLeadDays: Number(approvalLeadDays),
                  weekendPolicy, sourceCurrency,
                },
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
      </Card> : null}

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
              {canPrepare ? <Button
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
              </Button> : null}
            </CardContent>
          </Card>
        ))}
      </div>

      <PayrollLegalNote className="mt-8" />
    </div>
  )
}
