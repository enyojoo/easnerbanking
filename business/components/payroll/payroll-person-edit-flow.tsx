"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { ArrowLeft, CheckCircle2 } from "lucide-react"
import { toast } from "sonner"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { PayrollPageHeader } from "@/components/payroll/payroll-page-header"
import { PayrollCountrySelect } from "@/components/payroll/payroll-country-select"
import { PayrollCountry } from "@/components/payroll/payroll-country"
import { PayrollReceivingMethod } from "@/components/payroll/payroll-receiving-method"
import { PayrollFormSkeleton } from "@/components/payroll/payroll-page-skeleton"
import { RecipientForm, type RecipientFormRecipientKind } from "@/components/recipient-form"
import { Skeleton } from "@/components/ui/skeleton"
import { useUpdatePayrollPerson } from "@/hooks/mutations/use-payroll"
import { useRecipientsCached } from "@/hooks/use-recipients-cached"
import {
  usePayrollCapabilities,
  usePayrollPerson,
  usePayrollReceivingDestination,
  usePayrollSchedules,
  usePayrollSettings,
} from "@/hooks/queries/use-payroll"
import type { PayrollPersonType } from "@/lib/payroll/types"
import type { Beneficiary } from "@/lib/recipient-types"
import { formatCurrency } from "@/lib/utils"

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function receivingMethodKind(person: { rail: string }): RecipientFormRecipientKind {
  if (person.rail === "mobile") return "mobile"
  if (person.rail === "crypto") return "wallet"
  return "bank"
}

function railFromBeneficiary(destination: Beneficiary) {
  if (destination.mobileProvider) return "mobile" as const
  if (destination.walletNetwork) return "crypto" as const
  return "bank" as const
}

export function PayrollPersonEditFlow({ personId }: { personId: string }) {
  const router = useRouter()
  const personQuery = usePayrollPerson(personId)
  const schedulesQuery = usePayrollSchedules()
  const settingsQuery = usePayrollSettings()
  const capabilitiesQuery = usePayrollCapabilities()
  const update = useUpdatePayrollPerson()
  const updateMethod = useUpdatePayrollPerson()
  const person = personQuery.data?.person
  const recipientsCache = useRecipientsCached(Boolean(person?.recipientId))
  const destinationQuery = usePayrollReceivingDestination(
    personId,
    person?.rail === "easetag" ? null : person?.recipientId,
  )
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
  const [updatedDestination, setUpdatedDestination] = useState<Beneficiary | null>(null)
  const savedDestination = useMemo(
    () => updatedDestination
      ?? destinationQuery.data
      ?? recipientsCache.data.find((destination) => destination.id === person?.recipientId)
      ?? null,
    [destinationQuery.data, person?.recipientId, recipientsCache.data, updatedDestination],
  )

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

  function syncReceivingMethod(destination: Beneficiary) {
    setUpdatedDestination(destination)
    recipientsCache.setData((current) =>
      current.some((item) => item.id === destination.id)
        ? current.map((item) => (item.id === destination.id ? destination : item))
        : [destination, ...current],
    )
    updateMethod.mutate({
      id: currentPerson.id,
      patch: {
        recipientId: destination.id,
        rail: railFromBeneficiary(destination),
      },
    }, {
      onSuccess: () => toast.success("Receiving method updated"),
      onError: (error) => toast.error(error.message),
    })
  }

  return <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
    <Button variant="ghost" size="sm" className="mb-4" asChild><Link href={`/payroll/people/${person.id}`}><ArrowLeft className="mr-2 h-4 w-4" />Back to person</Link></Button>
    <PayrollPageHeader
      title="Edit person"
      description={person.rail === "easetag"
        ? "Review the connected EASETAG profile and update their Payroll setup."
        : "Update this person’s details and saved receiving method."}
    />
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
      <Card className="shadow-card"><CardContent className="space-y-6 p-6 sm:p-8">
        {person.rail === "easetag" ? (
          <div className="space-y-4">
            <div>
              <h2 className="font-semibold">EASETAG profile</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                This verified identity is connected to the person’s Easner account.
              </p>
            </div>
            <div className="flex items-center gap-3 rounded-xl border p-4">
              <Avatar className="h-12 w-12"><AvatarImage src={person.avatarUrl ?? undefined} /><AvatarFallback>{person.fullName.slice(0, 1)}</AvatarFallback></Avatar>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-medium">{person.fullName}</p>
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
                    <CheckCircle2 className="h-3.5 w-3.5" />Verified
                  </span>
                </div>
                <p className="truncate text-xs text-muted-foreground">{person.email || "No email available"}</p>
                <p className="truncate text-xs text-muted-foreground">@{person.easetag?.replace(/^@/, "")}</p>
              </div>
            </div>
            <dl className="grid gap-4 rounded-xl border bg-muted/20 p-4 text-sm sm:grid-cols-2">
              <IdentityField label="Email" value={person.email || "—"} />
              <div>
                <dt className="text-xs text-muted-foreground">Country of residence</dt>
                <dd className="mt-1 font-medium"><PayrollCountry country={person.country} /></dd>
              </div>
              <IdentityField label="Easetag" value={`@${person.easetag?.replace(/^@/, "") || "—"}`} />
              <IdentityField label="Receiving method" value="Easetag" />
            </dl>
            <p className="text-xs text-muted-foreground">
              Identity and contact details come from the approved EASETAG connection and are not edited by the business.
            </p>
          </div>
        ) : (
          <div className="space-y-5">
            <div>
              <h2 className="font-semibold">Payroll details</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Keep the person’s identity and payroll contact information up to date.
              </p>
            </div>
            <div className="grid gap-5 md:grid-cols-3">
              <Field label="Full name"><Input value={fullName} onChange={(event) => setFullName(event.target.value)} /></Field>
              <Field label="Email">
                <Input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" required />
                {email && !EMAIL_PATTERN.test(email.trim()) ? <p className="text-xs text-destructive">Enter a valid email address.</p> : <p className="text-xs text-muted-foreground">Payroll confirmations and pay stubs will be sent here.</p>}
              </Field>
              <Field label="Country of residence"><PayrollCountrySelect value={country} onChange={setCountry} /></Field>
            </div>
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
        {person.rail === "easetag" ? (
          <div className="rounded-xl border p-4">
            <p className="text-sm font-medium">EASETAG connection</p>
            <p className="mt-1 text-sm text-muted-foreground">
              The person controls the receiving method connected to this approved Payroll relationship.
            </p>
            <div className="mt-4 flex items-center justify-between rounded-lg bg-muted/30 px-3 py-3">
              <span className="text-sm text-muted-foreground">Receiving method</span>
              <PayrollReceivingMethod person={person} typeOnly />
            </div>
            <p className="mt-3 text-xs text-muted-foreground">The person manages their preferred receiving method through the Easner App.</p>
          </div>
        ) : (
          <div className="space-y-5 border-t pt-6">
            <div>
              <h2 className="font-semibold">Payment details</h2>
              <p className="mt-1 text-sm text-muted-foreground">Review and edit the receiving method saved for this person.</p>
            </div>
            {(destinationQuery.isPending || recipientsCache.loading) && !savedDestination ? (
              <div className="space-y-3">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-40 w-full" />
              </div>
            ) : savedDestination ? (
              <RecipientForm
                recipient={savedDestination}
                isEdit
                allowedRecipientTypes={[receivingMethodKind(person)]}
                terminology="payroll"
                onSuccess={() => undefined}
                onSuccessWithData={syncReceivingMethod}
              />
            ) : (
              <div className="rounded-xl border border-amber-300/60 bg-amber-50 p-4 text-sm text-amber-900">
                <p>These saved payment details could not be loaded.</p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="mt-3"
                  onClick={() => void destinationQuery.refetch()}
                  disabled={destinationQuery.isFetching}
                >
                  {destinationQuery.isFetching ? "Trying again…" : "Try again"}
                </Button>
              </div>
            )}
          </div>
        )}
        <div className="flex justify-end gap-2 border-t pt-5"><Button variant="outline" asChild><Link href={`/payroll/people/${person.id}`}>Cancel</Link></Button><Button variant="primary" disabled={update.isPending || updateMethod.isPending || !fullName.trim() || (person.rail !== "easetag" && (!EMAIL_PATTERN.test(email.trim()) || !country)) || !Number(amount)} onClick={save}>{update.isPending ? "Saving…" : "Save changes"}</Button></div>
      </CardContent></Card>
      <Card className="h-fit shadow-soft lg:sticky lg:top-6"><CardContent className="p-5"><p className="text-sm font-medium">Edit summary</p><dl className="mt-4 space-y-3 text-sm"><Summary label="Setup method" value={person.rail === "easetag" ? "EASETAG" : "Manual"} /><Summary label="Person" value={person.rail === "easetag" ? person.fullName : fullName || person.fullName} /><Summary label="Classification" value={type === "employee" ? "Employee" : "Contractor"} /><Summary label="Amount" value={amount ? formatCurrency(Number(amount), currency) : "—"} /><Summary label="Schedule" value={schedules.find((schedule) => schedule.id === scheduleId)?.name || "No schedule"} /><Summary label="Receiving method" value={person.rail === "easetag" ? "Easetag" : receivingMethodKind(person) === "mobile" ? "Mobile money" : receivingMethodKind(person) === "wallet" ? "Stablecoin wallet" : "Bank account"} /></dl></CardContent></Card>
    </div>
  </div>
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-2"><Label>{label}</Label>{children}</div>
}

function Summary({ label, value }: { label: string; value: string }) {
  return <div className="flex justify-between gap-3"><dt className="text-muted-foreground">{label}</dt><dd className="text-right">{value}</dd></div>
}

function IdentityField({ label, value }: { label: string; value: string }) {
  return <div><dt className="text-xs text-muted-foreground">{label}</dt><dd className="mt-1 truncate font-medium">{value}</dd></div>
}
