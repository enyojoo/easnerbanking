"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { CheckCircle2 } from "lucide-react"
import { toast } from "sonner"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { PayrollSubpageShell } from "@/components/payroll/payroll-subpage-shell"
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
import type { RecipientUpsertInput } from "@/lib/recipients-store"
import type { PayrollExternalReceivingMethodInput } from "@/lib/payroll/types"
import { formatCurrency } from "@/lib/utils"

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function receivingMethodKind(person: { rail: string }): RecipientFormRecipientKind {
  if (person.rail === "mobile") return "mobile"
  if (person.rail === "crypto") return "wallet"
  return "bank"
}

function receivingMethodDetails(method: {
  type: string
  details: Record<string, string>
}): string {
  if (method.type === "bank") {
    return [method.details.bankName, method.details.accountNumber, method.details.currency]
      .filter(Boolean)
      .join(" · ")
  }
  if (method.type === "mobile_money") {
    return [method.details.provider, method.details.phoneNumber, method.details.currency]
      .filter(Boolean)
      .join(" · ")
  }
  if (method.type === "stablecoin") {
    return [
      method.details.walletAddress,
      method.details.asset || method.details.currency,
      method.details.network,
    ]
      .filter(Boolean)
      .join(" · ")
  }
  return ""
}

function toPayrollReceivingMethod(input: RecipientUpsertInput): PayrollExternalReceivingMethodInput {
  const common = {
    fullName: input.fullName,
    currency: input.currency,
    email: input.email,
  }
  if (input.recipientType === "mobile") {
    return {
      ...common,
      type: "mobile_money",
      countryCode: input.countryCode || "",
      provider: input.mobileProvider || "",
      phoneNumber: input.phoneNumber || input.accountNumber,
    }
  }
  if (input.recipientType === "wallet") {
    return {
      ...common,
      type: "stablecoin",
      countryCode: input.countryCode,
      asset: input.walletAsset || input.currency,
      network: input.walletNetwork || "",
      walletAddress: input.accountNumber,
    }
  }
  return {
    ...common,
    type: "bank",
    countryCode: input.countryCode || "",
    bankName: input.bankName,
    accountNumber: input.accountNumber,
    routingNumber: input.routingNumber,
    sortCode: input.sortCode,
    iban: input.iban,
    swiftBic: input.swiftBic,
    transferType: input.transferType,
    checkingOrSavings: input.checkingOrSavings,
    phoneNumber: input.phoneNumber,
    addressLine1: input.addressLine1,
    city: input.city,
    state: input.state,
    postalCode: input.postalCode,
  }
}

export function PayrollPersonEditFlow({ personId }: { personId: string }) {
  const router = useRouter()
  const personQuery = usePayrollPerson(personId)
  const schedulesQuery = usePayrollSchedules()
  const settingsQuery = usePayrollSettings()
  const capabilitiesQuery = usePayrollCapabilities()
  const update = useUpdatePayrollPerson()
  const person = personQuery.data?.person
  const isEasetagPerson = Boolean(
    person?.easetag || person?.connectionId || (person && person.connectionStatus !== "manual"),
  )
  const recipientsCache = useRecipientsCached(Boolean(person?.recipientId && !isEasetagPerson))
  const destinationQuery = usePayrollReceivingDestination(
    personId,
    isEasetagPerson ? null : person?.recipientId ?? "payroll-owned",
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
  const [receivingMethodSaving, setReceivingMethodSaving] = useState(false)
  const savedDestination = useMemo(
    () =>
      destinationQuery.data ??
      recipientsCache.data.find((destination) => destination.id === person?.recipientId) ??
      null,
    [destinationQuery.data, person?.recipientId, recipientsCache.data],
  )
  const employeePreferredMethod =
    personQuery.data?.connection?.preferredMethod ?? person?.receivingMethodSummary ?? null

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
    (personQuery.isPending && !person) ||
    (schedulesQuery.isPending && !schedulesQuery.data) ||
    (settingsQuery.isPending && !settingsQuery.data)
  ) {
    return <PayrollFormSkeleton />
  }
  if (!person) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-12">
        <p className="font-medium">This payroll person could not be found.</p>
        <Button className="mt-4" variant="outline" asChild>
          <Link href="/payroll/people">Back to People</Link>
        </Button>
      </div>
    )
  }
  if (!capabilitiesQuery.isPending && !capabilitiesQuery.data?.canPrepare) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
        <Card>
          <CardContent className="p-8 text-center">
            <h1 className="text-lg font-semibold">You can’t edit Payroll people</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Ask a Payroll preparer or approver to update this person.
            </p>
            <Button className="mt-5" variant="outline" asChild>
              <Link href={`/payroll/people/${person.id}`}>Back to person</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }
  const currentPerson = person

  async function save(destination?: RecipientUpsertInput) {
    try {
      const manualDestination = !isEasetagPerson ? destination : undefined
      await update.mutateAsync({
        id: currentPerson.id,
        patch: {
          fullName: isEasetagPerson ? currentPerson.fullName : fullName,
          email: isEasetagPerson ? currentPerson.email : email || null,
          country: isEasetagPerson ? currentPerson.country : country || null,
          type,
          defaultAmount: Number(amount),
          payCurrency: currency,
          internalReference: reference || null,
          scheduleIds: scheduleId ? [scheduleId] : [],
          ...(manualDestination
            ? {
                receivingMethod: toPayrollReceivingMethod(manualDestination),
              }
            : {}),
        },
      })
      toast.success("Person updated")
      router.push(`/payroll/people/${currentPerson.id}`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Person could not be updated")
    }
  }

  return (
    <PayrollSubpageShell
      backHref={`/payroll/people/${person.id}`}
      backLabel="Back to person"
      section="People"
      sectionHref="/payroll/people"
      current={person.fullName}
        title="Edit person"
        description={
          isEasetagPerson
            ? "Review the connected EASETAG profile and update their Payroll setup."
            : "Update this person’s details and saved receiving method."
        }
    >
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <Card className="shadow-card">
          <CardContent className="space-y-6 p-6 sm:p-8">
            {isEasetagPerson ? (
              <div>
                <div className="flex flex-col gap-4 rounded-xl border p-4 sm:flex-row sm:items-center">
                  <Avatar className="h-12 w-12">
                    <AvatarImage src={person.avatarUrl ?? undefined} />
                    <AvatarFallback>{person.fullName.slice(0, 1)}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium">{person.fullName}</p>
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        Verified
                      </span>
                    </div>
                    <p className="mt-1 truncate text-xs text-muted-foreground">
                      Easetag: @{person.easetag?.replace(/^@/, "") || "—"}
                      <span aria-hidden="true"> · </span>
                      Email: {person.email || "—"}
                    </p>
                  </div>
                  <div className="sm:text-right">
                    <p className="text-xs text-muted-foreground">Residence</p>
                    <div className="mt-1 text-sm font-medium">
                      <PayrollCountry country={person.country} />
                    </div>
                  </div>
                </div>
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
                  <Field label="Full name">
                    <Input value={fullName} onChange={(event) => setFullName(event.target.value)} />
                  </Field>
                  <Field label="Email">
                    <Input
                      type="email"
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      autoComplete="email"
                      required
                    />
                    {email && !EMAIL_PATTERN.test(email.trim()) ? (
                      <p className="text-xs text-destructive">Enter a valid email address.</p>
                    ) : (
                      <p className="text-xs text-muted-foreground">
                        Payroll confirmations and pay stubs will be sent here.
                      </p>
                    )}
                  </Field>
                  <Field label="Country of residence">
                    <PayrollCountrySelect value={country} onChange={setCountry} />
                  </Field>
                </div>
              </div>
            )}
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="Classification">
                <Select value={type} onValueChange={(value) => setType(value as PayrollPersonType)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="employee">Employee</SelectItem>
                    <SelectItem value="contractor">Contractor</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Schedule (optional)">
                <Select
                  value={scheduleId || "none"}
                  onValueChange={(value) => setScheduleId(value === "none" ? "" : value)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No schedule</SelectItem>
                    {schedules.map((schedule) => (
                      <SelectItem key={schedule.id} value={schedule.id}>
                        {schedule.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </div>
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="Amount">
                <div className="relative">
                  <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm font-medium text-muted-foreground">
                    {currency}
                  </span>
                  <Input
                    className="pl-14"
                    inputMode="decimal"
                    value={amount}
                    onChange={(event) => setAmount(event.target.value.replace(/[^\d.]/g, ""))}
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  This amount prefills the person’s payment when you create a payroll run.
                </p>
              </Field>
              <Field label="Internal reference (optional)">
                <Input value={reference} onChange={(event) => setReference(event.target.value)} placeholder="EMP-001" />
              </Field>
            </div>
            {isEasetagPerson ? (
              <div className="rounded-xl border p-4">
                <div className="flex items-center justify-between gap-4">
                  <span className="text-sm text-muted-foreground">Receiving method</span>
                  <PayrollReceivingMethod
                    person={{
                      ...person,
                      receivingMethodSummary: employeePreferredMethod,
                    }}
                    typeOnly
                  />
                </div>
                {employeePreferredMethod && employeePreferredMethod.type !== "easetag" ? (
                  <p className="mt-1 text-right text-xs text-muted-foreground">
                    {receivingMethodDetails(employeePreferredMethod)}
                  </p>
                ) : null}
                <p className="mt-2 text-xs text-muted-foreground">
                  The person manages this receiving method through the Easner App.
                </p>
              </div>
            ) : (
              <div className="space-y-5 border-t pt-6">
                <div>
                  <h2 className="font-semibold">Payment details</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Review and edit the receiving method saved for this person.
                  </p>
                </div>
                {(destinationQuery.isPending || recipientsCache.loading) && !savedDestination ? (
                  <div className="space-y-3">
                    <Skeleton className="h-10 w-full" />
                    <Skeleton className="h-40 w-full" />
                  </div>
                ) : (
                  <RecipientForm
                    recipient={savedDestination ?? undefined}
                    isEdit={Boolean(savedDestination)}
                    formId="payroll-manual-receiving-method-form"
                    hideSubmitButton
                    allowedRecipientTypes={["bank", "mobile", "wallet"]}
                    terminology="payroll"
                    onSuccess={() => undefined}
                    onValidatedSubmit={save}
                    onSubmittingChange={setReceivingMethodSaving}
                  />
                )}
              </div>
            )}
            <div className="flex justify-end gap-2 border-t pt-5">
              <Button variant="outline" asChild>
                <Link href={`/payroll/people/${person.id}`}>Cancel</Link>
              </Button>
              <Button
                variant="primary"
                disabled={
                  update.isPending ||
                  receivingMethodSaving ||
                  !fullName.trim() ||
                  (!isEasetagPerson && (!EMAIL_PATTERN.test(email.trim()) || !country)) ||
                  !Number(amount)
                }
                onClick={() => {
                  if (isEasetagPerson) void save()
                  else
                    (
                      document.getElementById("payroll-manual-receiving-method-form") as HTMLFormElement | null
                    )?.requestSubmit()
                }}
              >
                {update.isPending || receivingMethodSaving ? "Saving…" : "Save changes"}
              </Button>
            </div>
          </CardContent>
        </Card>
        <Card className="h-fit shadow-soft lg:sticky lg:top-6">
          <CardContent className="p-5">
            <p className="text-sm font-medium">Edit summary</p>
            <dl className="mt-4 space-y-3 text-sm">
              <Summary label="Setup method" value={isEasetagPerson ? "EASETAG" : "Manual"} />
              <Summary label="Person" value={isEasetagPerson ? person.fullName : fullName || person.fullName} />
              <Summary label="Classification" value={type === "employee" ? "Employee" : "Contractor"} />
              <Summary label="Amount" value={amount ? formatCurrency(Number(amount), currency) : "—"} />
              <Summary
                label="Schedule"
                value={schedules.find((schedule) => schedule.id === scheduleId)?.name || "No schedule"}
              />
              <Summary
                label="Receiving method"
                value={
                  isEasetagPerson
                    ? payrollMethodTypeLabel(employeePreferredMethod?.type)
                    : receivingMethodKind(person) === "mobile"
                      ? "Mobile money"
                      : receivingMethodKind(person) === "wallet"
                        ? "Stablecoin wallet"
                        : "Bank account"
                }
              />
            </dl>
          </CardContent>
        </Card>
      </div>
    </PayrollSubpageShell>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {children}
    </div>
  )
}

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right">{value}</dd>
    </div>
  )
}

function payrollMethodTypeLabel(type?: string) {
  if (type === "bank") return "Bank account"
  if (type === "mobile_money") return "Mobile money"
  if (type === "stablecoin") return "Stablecoin wallet"
  return "Easetag"
}
