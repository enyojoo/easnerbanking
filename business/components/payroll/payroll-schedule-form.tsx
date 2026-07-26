"use client"

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { usePayrollPeople, usePayrollSettings } from "@/hooks/queries/use-payroll"
import { useUpsertPayrollSchedule } from "@/hooks/mutations/use-payroll"
import { payrollPaydayPreview, type PayrollWeekendPolicy } from "@/lib/payroll/schedule-preview"
import { formatDate } from "@/lib/utils"
import type { PayrollSchedule, PayrollScheduleFrequency } from "@/lib/payroll/types"

export function PayrollScheduleForm({ schedule }: { schedule?: PayrollSchedule }) {
  const router = useRouter()
  const save = useUpsertPayrollSchedule()
  const people = usePayrollPeople().data ?? []
  const payrollSettings = usePayrollSettings().data
  const template = schedule?.template ?? {}
  const [name, setName] = useState(schedule?.name ?? "Monthly payroll")
  const [frequency, setFrequency] = useState<PayrollScheduleFrequency>(schedule?.frequency ?? "monthly")
  const [nextRunAt, setNextRunAt] = useState(schedule?.nextRunAt ?? new Date().toISOString().slice(0, 10))
  const [weekendPolicy, setWeekendPolicy] = useState<PayrollWeekendPolicy>((template.weekendPolicy as PayrollWeekendPolicy) || "previous_business_day")
  const [personIds, setPersonIds] = useState<string[]>(schedule?.personIds ?? [])
  const preview = useMemo(() => payrollPaydayPreview({ frequency, firstPayday: nextRunAt, weekendPolicy }), [frequency, nextRunAt, weekendPolicy])
  const timezone = payrollSettings?.timezone || "UTC"
  const sourceAccountId = payrollSettings?.defaultSourceAccountId || ""
  const sourceCurrency = payrollSettings?.defaultCurrency || "USD"

  return <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
    <Card className="shadow-card"><CardContent className="space-y-7 p-6 sm:p-8">
      <section><h2 className="font-semibold">Schedule details</h2><div className="mt-4 grid gap-5 sm:grid-cols-2">
        <Field label="Name"><Input value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <Field label="First payday"><Input type="date" value={nextRunAt} onChange={(e) => setNextRunAt(e.target.value)} /></Field>
        <Field label="Frequency"><Select value={frequency} onValueChange={(v) => setFrequency(v as PayrollScheduleFrequency)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="weekly">Weekly</SelectItem><SelectItem value="biweekly">Biweekly</SelectItem><SelectItem value="monthly">Monthly</SelectItem><SelectItem value="semimonthly">Twice monthly</SelectItem></SelectContent></Select></Field>
        <Field label="Weekend handling"><Select value={weekendPolicy} onValueChange={(v) => setWeekendPolicy(v as PayrollWeekendPolicy)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="previous_business_day">Previous business day</SelectItem><SelectItem value="next_business_day">Next business day</SelectItem></SelectContent></Select></Field>
      </div></section>
      <section><h2 className="font-semibold">Included people</h2><p className="mt-1 text-sm text-muted-foreground">People can be added or removed without changing completed runs.</p><div className="mt-4 max-h-72 divide-y overflow-y-auto rounded-xl border">{people.map((person) => <label key={person.id} className="flex cursor-pointer items-center gap-3 p-3"><input type="checkbox" checked={personIds.includes(person.id)} onChange={() => setPersonIds((current) => current.includes(person.id) ? current.filter((id) => id !== person.id) : [...current, person.id])} /><span className="flex-1 text-sm">{person.fullName}</span><span className="text-xs capitalize text-muted-foreground">{person.type}</span></label>)}</div></section>
      <section className="rounded-xl border bg-muted/30 p-4">
        <h2 className="text-sm font-medium">Automatic preparation and funding checks</h2>
        <p className="mt-1 text-sm text-muted-foreground">Easner prepares a payroll draft 5 days before each payday. If the selected account cannot cover the upcoming run, owners and administrators are notified before payday.</p>
      </section>
      <div className="flex justify-end gap-2 border-t pt-5"><Button variant="outline" onClick={() => router.push("/payroll/schedules")}>Cancel</Button><Button variant="primary" disabled={save.isPending || !name.trim() || !nextRunAt || !sourceAccountId} onClick={() => save.mutate({
        id: schedule?.id, name, frequency, nextRunAt, active: schedule?.active ?? true, timezone,
        weekendPolicy, sourceCurrency, sourceAccountId, personIds,
      } as never, { onSuccess: (result) => { toast.success("Schedule saved"); router.push(`/payroll/schedules/${result.schedule.id}`) }, onError: (error) => toast.error(error.message) })}>{save.isPending ? "Saving…" : "Save schedule"}</Button></div>
    </CardContent></Card>
    <Card className="h-fit shadow-soft lg:sticky lg:top-6"><CardContent className="p-5"><h2 className="font-semibold">Upcoming paydays</h2><ol className="mt-4 space-y-3">{preview.map((date, index) => <li key={date} className="flex items-center justify-between rounded-xl bg-muted/50 p-3 text-sm"><span>{index === 0 ? "Next" : `After ${index}`}</span><span className="font-medium">{formatDate(date)}</span></li>)}</ol><p className="mt-4 text-xs text-muted-foreground">Dates are adjusted using the selected weekend policy.</p></CardContent></Card>
  </div>
}

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <div className="space-y-2"><Label>{label}</Label>{children}</div> }
