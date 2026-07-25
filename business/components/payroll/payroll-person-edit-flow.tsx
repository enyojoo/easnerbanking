"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { ArrowLeft } from "lucide-react"
import { toast } from "sonner"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { PayrollPageHeader } from "@/components/payroll/payroll-page-header"
import { PayrollReceivingMethod } from "@/components/payroll/payroll-receiving-method"
import { PayrollFormSkeleton } from "@/components/payroll/payroll-page-skeleton"
import { useUpdatePayrollPerson } from "@/hooks/mutations/use-payroll"
import {
  usePayrollCapabilities,
  usePayrollPerson,
  usePayrollSchedules,
  usePayrollSettings,
} from "@/hooks/queries/use-payroll"
import type { PayrollPersonType } from "@/lib/payroll/types"
import { formatCurrency } from "@/lib/utils"

export function PayrollPersonEditFlow({ personId }: { personId: string }) {
  const router = useRouter()
  const personQuery = usePayrollPerson(personId)
  const schedulesQuery = usePayrollSchedules()
  const settingsQuery = usePayrollSettings()
  const capabilitiesQuery = usePayrollCapabilities()
  const update = useUpdatePayrollPerson()
  const person = personQuery.data?.person
  const schedules = useMemo(() => schedulesQuery.data ?? [], [schedulesQuery.data])
  const currency = String(settingsQuery.data?.defaultCurrency || person?.payCurrency || "USD").toUpperCase()
  const [initializedPersonId, setInitializedPersonId] = useState("")
  const [fullName, setFullName] = useState("")
  const [email, setEmail] = useState("")
  const [country, setCountry] = useState("")
  const [type, setType] = useState<PayrollPersonType>("employee")
  const [amount, setAmount] = useState("")
  const [reference, setReference] = useState("")
  const [scheduleId, setScheduleId] = useState("")

  useEffect(() => {
    if (!person || initializedPersonId === person.id || schedulesQuery.isPending) return
    setFullName(person.fullName)
    setEmail(person.email || "")
    setCountry(person.country || "")
    setType(person.type)
    setAmount(String(person.defaultAmount))
    setReference(person.internalReference || "")
    setScheduleId(schedules.find((schedule) => schedule.personIds?.includes(person.id))?.id || "")
    setInitializedPersonId(person.id)
  }, [initializedPersonId, person, schedules, schedulesQuery.isPending])

  if (
    (personQuery.isPending && !person)
    || (schedulesQuery.isPending && !schedulesQuery.data)
    || (settingsQuery.isPending && !settingsQuery.data)
  ) {
    return <PayrollFormSkeleton />
  }
  if (!person) {
    return <div className="mx-auto max-w-6xl px-4 py-12"><p className="font-medium">This payroll person could not be found.</p><Button className="mt-4" variant="outline" asChild><Link href="/payroll/people">Back to People</Link></Button></div>
  }
  if (!capabilitiesQuery.isPending && !capabilitiesQuery.data?.canPrepare) {
    return <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6"><Card><CardContent className="p-8 text-center"><h1 className="text-lg font-semibold">You can’t edit Payroll people</h1><p className="mt-2 text-sm text-muted-foreground">Ask a Payroll preparer or approver to update this person.</p><Button className="mt-5" variant="outline" asChild><Link href={`/payroll/people/${person.id}`}>Back to person</Link></Button></CardContent></Card></div>
  }
  const currentPerson = person

  function save() {
    update.mutate({
      id: currentPerson.id,
      patch: {
        fullName: currentPerson.rail === "easetag" ? currentPerson.fullName : fullName,
        email: currentPerson.rail === "easetag" ? currentPerson.email : email || null,
        country: currentPerson.rail === "easetag" ? currentPerson.country : country || null,
        type,
        defaultAmount: Number(amount),
        payCurrency: currency,
        internalReference: reference || null,
        scheduleIds: scheduleId ? [scheduleId] : [],
      },
    }, {
      onSuccess: () => {
        toast.success("Person updated")
        router.push(`/payroll/people/${currentPerson.id}`)
      },
      onError: (error) => toast.error(error.message),
    })
  }

  return <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
    <Button variant="ghost" size="sm" className="mb-4" asChild><Link href={`/payroll/people/${person.id}`}><ArrowLeft className="mr-2 h-4 w-4" />Back to person</Link></Button>
    <PayrollPageHeader title="Edit person" description="Update this person’s Payroll details and saved amount." />
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
      <Card className="shadow-card"><CardContent className="space-y-6 p-6 sm:p-8">
        {person.rail === "easetag" ? (
          <div className="flex items-center gap-3 rounded-xl border p-4">
            <Avatar className="h-11 w-11"><AvatarImage src={person.avatarUrl ?? undefined} /><AvatarFallback>{person.fullName.slice(0, 1)}</AvatarFallback></Avatar>
            <div className="min-w-0">
              <p className="font-medium">{person.fullName}</p>
              <p className="truncate text-xs text-muted-foreground">{person.email || "No email available"} · @{person.easetag?.replace(/^@/, "")}</p>
            </div>
          </div>
        ) : (
          <div className="grid gap-5 md:grid-cols-3">
            <Field label="Full name"><Input value={fullName} onChange={(event) => setFullName(event.target.value)} /></Field>
            <Field label="Email (optional)"><Input type="email" value={email} onChange={(event) => setEmail(event.target.value)} /></Field>
            <Field label="Residence country"><Input value={country} onChange={(event) => setCountry(event.target.value)} placeholder="Country or code" /></Field>
          </div>
        )}
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Classification"><Select value={type} onValueChange={(value) => setType(value as PayrollPersonType)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="employee">Employee</SelectItem><SelectItem value="contractor">Contractor</SelectItem></SelectContent></Select></Field>
          <Field label="Schedule (optional)"><Select value={scheduleId || "none"} onValueChange={(value) => setScheduleId(value === "none" ? "" : value)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">No schedule</SelectItem>{schedules.map((schedule) => <SelectItem key={schedule.id} value={schedule.id}>{schedule.name}</SelectItem>)}</SelectContent></Select></Field>
        </div>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Amount"><div className="relative"><span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm font-medium text-muted-foreground">{currency}</span><Input className="pl-14" inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value.replace(/[^\d.]/g, ""))} /></div><p className="text-xs text-muted-foreground">This amount prefills the person’s payment when you create a payroll run.</p></Field>
          <Field label="Internal reference (optional)"><Input value={reference} onChange={(event) => setReference(event.target.value)} placeholder="EMP-001" /></Field>
        </div>
        <div className="rounded-xl border p-4"><p className="text-sm font-medium">Receiving method</p><div className="mt-2"><PayrollReceivingMethod person={person} typeOnly /></div><p className="mt-2 text-xs text-muted-foreground">{person.rail === "easetag" ? "The person manages their preferred receiving method through the Easner App." : "Payment details remain protected and unchanged when these details are saved."}</p></div>
        <div className="flex justify-end gap-2 border-t pt-5"><Button variant="outline" asChild><Link href={`/payroll/people/${person.id}`}>Cancel</Link></Button><Button variant="primary" disabled={update.isPending || !fullName.trim() || !Number(amount)} onClick={save}>{update.isPending ? "Saving…" : "Save changes"}</Button></div>
      </CardContent></Card>
      <Card className="h-fit shadow-soft lg:sticky lg:top-6"><CardContent className="p-5"><p className="text-sm font-medium">Person summary</p><dl className="mt-4 space-y-3 text-sm"><Summary label="Person" value={person.fullName} /><Summary label="Classification" value={type === "employee" ? "Employee" : "Contractor"} /><Summary label="Amount" value={amount ? formatCurrency(Number(amount), currency) : "—"} /><Summary label="Schedule" value={schedules.find((schedule) => schedule.id === scheduleId)?.name || "No schedule"} /></dl></CardContent></Card>
    </div>
  </div>
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-2"><Label>{label}</Label>{children}</div>
}

function Summary({ label, value }: { label: string; value: string }) {
  return <div className="flex justify-between gap-3"><dt className="text-muted-foreground">{label}</dt><dd className="text-right">{value}</dd></div>
}
