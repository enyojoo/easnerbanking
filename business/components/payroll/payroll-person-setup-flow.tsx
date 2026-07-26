"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { ArrowLeft, ArrowRight, AtSign, CheckCircle2, Landmark, Search, WalletCards } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { RecipientForm } from "@/components/recipient-form"
import { PayrollPageHeader } from "@/components/payroll/payroll-page-header"
import { PayrollCountrySelect } from "@/components/payroll/payroll-country-select"
import { useCreatePayrollPerson, useInvitePayrollPerson } from "@/hooks/mutations/use-payroll"
import { usePayrollCapabilities, usePayrollSchedules, usePayrollSettings } from "@/hooks/queries/use-payroll"
import { fetchPayrollEasetagProfileByTag, type PayrollEasetagProfile } from "@/lib/easenet-profile"
import type { Beneficiary } from "@/lib/recipient-types"
import type { PayrollPerson, PayrollPersonType, PayrollRail } from "@/lib/payroll/types"
import { cn } from "@/lib/utils"

type Method = "easetag" | "manual"
type Step = "method" | "details" | "payment" | "review" | "success"
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function railFromBeneficiary(person: Beneficiary): PayrollRail {
  if (person.mobileProvider) return "mobile"
  if (person.walletNetwork) return "crypto"
  return "bank"
}

function safeReturnTo(value: string | null) {
  return value === "/payroll" || value?.startsWith("/payroll/") ? value : "/payroll"
}

export function PayrollPersonSetupFlow() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const returnTo = safeReturnTo(searchParams.get("returnTo"))
  const createPerson = useCreatePayrollPerson()
  const invitePerson = useInvitePayrollPerson()
  const capabilitiesQuery = usePayrollCapabilities()
  const settingsQuery = usePayrollSettings()
  const settings = settingsQuery.data
  const businessCurrency = String(settings?.defaultCurrency || "USD").toUpperCase()
  const schedules = usePayrollSchedules().data ?? []
  const [method, setMethod] = useState<Method | null>(null)
  const [step, setStep] = useState<Step>("method")
  const [profile, setProfile] = useState<PayrollEasetagProfile | null>(null)
  const [lookup, setLookup] = useState("")
  const [lookupState, setLookupState] = useState<"idle" | "loading" | "missing" | "invalid">("idle")
  const [type, setType] = useState<PayrollPersonType>("employee")
  const [email, setEmail] = useState("")
  const [country, setCountry] = useState("")
  const [amount, setAmount] = useState("")
  const [reference, setReference] = useState("")
  const [scheduleId, setScheduleId] = useState("")
  const [sendInvitation, setSendInvitation] = useState(true)
  const [created, setCreated] = useState<PayrollPerson | null>(null)

  const steps = useMemo(
    () =>
      method === "manual" ? ["Setup", "Details", "Payment details", "Done"] : ["Setup", "Details", "Review", "Done"],
    [method],
  )
  const activeIndex =
    step === "method" ? 0 : step === "details" ? 1 : step === "payment" ? 2 : step === "review" ? 2 : 3

  if (!capabilitiesQuery.isPending && !capabilitiesQuery.data?.canPrepare) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
        <Card>
          <CardContent className="p-8 text-center">
            <h1 className="text-lg font-semibold">You can’t add Payroll people</h1>
            <p className="mt-2 text-sm text-muted-foreground">Ask a Payroll preparer or approver to add this person.</p>
            <Button className="mt-5" variant="outline" onClick={() => router.push("/payroll/people")}>
              Back to People
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  async function findEasetag() {
    setLookupState("loading")
    const result = await fetchPayrollEasetagProfileByTag(lookup).catch(() => ({ found: false }) as const)
    if (!result.found) {
      setProfile(null)
      setLookupState("missing")
      return
    }
    if (!result.verified || result.accountKind !== "personal") {
      setProfile(result)
      setLookupState("invalid")
      return
    }
    setProfile(result)
    setLookupState("idle")
  }

  async function createEasetagPerson() {
    if (!profile) return
    try {
      const result = await createPerson.mutateAsync({
        mode: "easetag",
        easetag: profile.easetag,
        type,
        defaultAmount: Number(amount),
        payCurrency: businessCurrency,
        internalReference: reference || undefined,
        scheduleIds: scheduleId ? [scheduleId] : [],
        sendInvitation,
      })
      if (sendInvitation) {
        await invitePerson.mutateAsync(result.person.id)
      }
      setCreated(result.person)
      setStep("success")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not add this person")
    }
  }

  async function createManualPerson(destination: Beneficiary) {
    try {
      const result = await createPerson.mutateAsync({
        type,
        fullName: destination.name,
        email: email.trim().toLowerCase(),
        country,
        defaultAmount: Number(amount),
        payCurrency: businessCurrency,
        recipientId: destination.id,
        rail: railFromBeneficiary(destination),
        status: "active",
        internalReference: reference || null,
        scheduleIds: scheduleId ? [scheduleId] : [],
      })
      setCreated(result.person)
      setStep("success")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not add this person")
    }
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <Button variant="ghost" size="sm" className="mb-4" asChild>
        <Link href={returnTo}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          {returnTo === "/payroll"
            ? "Back to Payroll"
            : returnTo.includes("/runs/new")
              ? "Back to payroll run"
              : "Back to People"}
        </Link>
      </Button>
      <PayrollPageHeader
        title="Add person"
        description="Set up an employee or contractor and how they receive payroll."
      />
      <div className="mb-8 flex items-center gap-2 overflow-x-auto" aria-label="Setup progress">
        {steps.map((label, index) => (
          <div key={label} className="flex shrink-0 items-center gap-2">
            <span
              className={cn(
                "flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold",
                index <= activeIndex ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
              )}
            >
              {index + 1}
            </span>
            <span className={cn("text-xs", index <= activeIndex ? "text-foreground" : "text-muted-foreground")}>
              {label}
            </span>
            {index < steps.length - 1 ? <span className="h-px w-6 bg-border sm:w-12" /> : null}
          </div>
        ))}
      </div>

      {step === "method" ? (
        <div className="grid gap-4 md:grid-cols-2">
          <MethodCard
            icon={AtSign}
            title="Connect with EASETAG"
            description="Request verified identity details with consent and use EASETAG as the default receiving method."
            badge="Recommended"
            onClick={() => {
              setMethod("easetag")
              setStep("details")
            }}
          />
          <MethodCard
            icon={WalletCards}
            title="Add manually"
            description="Enter a bank account, mobile-money account, or stablecoin wallet directly."
            onClick={() => {
              setMethod("manual")
              setStep("details")
            }}
          />
        </div>
      ) : null}

      {step === "details" ? (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
          <Card className="shadow-card">
            <CardContent className="space-y-5 p-6">
              {method === "easetag" ? (
                <div className="space-y-2">
                  <Label htmlFor="easetag">EASETAG</Label>
                  <div className="flex gap-2">
                    <Input
                      id="easetag"
                      value={lookup}
                      onChange={(e) => {
                        setLookup(e.target.value)
                        setProfile(null)
                        setLookupState("idle")
                      }}
                      placeholder="@easetag"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => void findEasetag()}
                      disabled={lookupState === "loading" || lookup.replace(/^@/, "").length < 4}
                    >
                      <Search className="mr-2 h-4 w-4" />
                      {lookupState === "loading" ? "Checking…" : "Find"}
                    </Button>
                  </div>
                  {lookupState === "missing" ? (
                    <p className="text-sm text-destructive">We couldn’t find that EASETAG.</p>
                  ) : null}
                  {profile ? (
                    <div className="flex items-center gap-3 rounded-xl border p-3">
                      <Avatar className="h-10 w-10">
                        <AvatarImage src={profile.avatarUrl ?? undefined} />
                        <AvatarFallback>{profile.fullName.slice(0, 1)}</AvatarFallback>
                      </Avatar>
                      <div className="min-w-0">
                        <p className="text-sm font-medium">{profile.fullName}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {profile.email || "No email available"} · @{profile.easetag.replace(/^@/, "")}
                        </p>
                      </div>
                    </div>
                  ) : null}
                  {lookupState === "invalid" ? (
                    <p className="text-sm text-amber-700">
                      Payroll requests can only be sent to verified personal EASETAG accounts.
                    </p>
                  ) : null}
                  {profile?.accountKind === "personal" && profile.verified && !profile.email ? (
                    <p className="text-sm text-amber-700">
                      This EASETAG does not have an email available for a payroll request.
                    </p>
                  ) : null}
                </div>
              ) : (
                <div className="rounded-xl border bg-muted/30 p-4 text-sm">
                  Enter the person’s payroll details now. You’ll add and validate their receiving method on the next
                  step.
                </div>
              )}
              <div className="space-y-5">
                {method === "manual" ? (
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Email">
                      <Input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="person@example.com"
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
                ) : (
                  <p className="text-xs text-muted-foreground">
                    The payroll request will be sent to {profile?.email || "the email connected to this EASETAG"}.
                  </p>
                )}
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Classification">
                    <Select value={type} onValueChange={(v) => setType(v as PayrollPersonType)}>
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
                    <Select value={scheduleId || "none"} onValueChange={(v) => setScheduleId(v === "none" ? "" : v)}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">No schedule</SelectItem>
                        {schedules.map((s) => (
                          <SelectItem key={s.id} value={s.id}>
                            {s.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Amount">
                    <div className="relative">
                      <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm font-medium text-muted-foreground">
                        {businessCurrency}
                      </span>
                      <Input
                        className="pl-14"
                        inputMode="decimal"
                        value={amount}
                        onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))}
                        placeholder="0.00"
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      This amount prefills the person’s payment when you create a payroll run.
                    </p>
                  </Field>
                  <Field label="Internal reference (optional)">
                    <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="EMP-001" />
                  </Field>
                </div>
              </div>
              {method === "easetag" ? (
                <label className="flex items-start gap-3 rounded-xl border p-3 text-sm">
                  <input
                    type="checkbox"
                    checked={sendInvitation}
                    onChange={(e) => setSendInvitation(e.target.checked)}
                    className="mt-1"
                  />
                  <span>
                    <span className="font-medium">Send payroll request now</span>
                    <span className="block text-xs text-muted-foreground">
                      The request expires after seven days. Saving without sending keeps the person in a needs-attention
                      state.
                    </span>
                  </span>
                </label>
              ) : null}
              <div className="flex justify-between pt-2">
                <Button
                  variant="ghost"
                  onClick={() => {
                    setStep("method")
                    setMethod(null)
                  }}
                >
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  Back
                </Button>
                <Button
                  variant="primary"
                  onClick={() => setStep(method === "manual" ? "payment" : "review")}
                  disabled={
                    settingsQuery.isPending ||
                    !Number(amount) ||
                    (method === "manual" && (!EMAIL_PATTERN.test(email.trim()) || !country)) ||
                    (method === "easetag" && (!profile || (sendInvitation && !profile.email)))
                  }
                >
                  Continue
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
          <SetupSummary method={method} profile={profile} type={type} amount={amount} currency={businessCurrency} />
        </div>
      ) : null}

      {step === "payment" ? (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
          <Card className="shadow-card">
            <CardContent className="p-6 sm:p-8">
              <div className="mb-5">
                <h2 className="font-semibold">Payment details</h2>
                <p className="text-sm text-muted-foreground">
                  Choose and validate one receiving method. These details remain protected.
                </p>
              </div>
              <RecipientForm
                allowedRecipientTypes={["bank", "mobile", "wallet"]}
                submitButtonLabel="Save person"
                terminology="payroll"
                onSuccess={() => undefined}
                onSuccessWithData={(destination) => void createManualPerson(destination)}
              />
              <Button className="mt-3" variant="ghost" onClick={() => setStep("details")}>
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to payroll details
              </Button>
            </CardContent>
          </Card>
          <SetupSummary
            method={method}
            profile={profile}
            type={type}
            amount={amount}
            currency={businessCurrency}
            manualEmail={email}
          />
        </div>
      ) : null}

      {step === "review" && profile ? (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
          <Card className="shadow-card">
            <CardContent className="space-y-5 p-6">
              <div>
                <h2 className="font-semibold">Review payroll request</h2>
                <p className="mt-1 text-sm text-muted-foreground">Nothing is shared until the person approves.</p>
              </div>
              <div className="rounded-xl border p-4">
                <p className="text-sm font-medium">Information requested</p>
                <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
                  <li>Verified legal name and residence country</li>
                  <li>Profile photo, EASETAG, and verification status</li>
                  <li>The receiving method they approve for this business</li>
                </ul>
              </div>
              <div className="rounded-xl border p-4 text-sm">
                <span className="font-medium">Receiving method:</span> Easetag
              </div>
              <div className="flex flex-wrap justify-between gap-2">
                <Button variant="ghost" onClick={() => setStep("details")}>
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  Back
                </Button>
                <Button
                  variant="primary"
                  onClick={() => void createEasetagPerson()}
                  disabled={createPerson.isPending || invitePerson.isPending}
                >
                  {sendInvitation ? "Send payroll request" : "Save without sending"}
                </Button>
              </div>
            </CardContent>
          </Card>
          <SetupSummary method={method} profile={profile} type={type} amount={amount} currency={businessCurrency} />
        </div>
      ) : null}

      {step === "success" && created ? (
        <Card className="mx-auto max-w-2xl shadow-card">
          <CardContent className="p-8 text-center">
            <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-600" />
            <h2 className="mt-4 text-xl font-semibold">{created.fullName} was added</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              {created.rail === "easetag" && sendInvitation
                ? "Their payroll request has been sent."
                : "Their payroll details are ready to review."}
            </p>
            <div className="mt-6 flex flex-wrap justify-center gap-2">
              <Button
                variant="outline"
                onClick={() => window.location.assign(`/payroll/people/new?returnTo=${encodeURIComponent(returnTo)}`)}
              >
                Add another person
              </Button>
              <Button variant="outline" onClick={() => router.push(`/payroll/people/${created.id}`)}>
                View person
              </Button>
              <Button
                variant="primary"
                onClick={() =>
                  router.push(
                    returnTo.startsWith("/payroll/runs/new")
                      ? `${returnTo}${returnTo.includes("?") ? "&" : "?"}addedPerson=${created.id}`
                      : returnTo,
                  )
                }
              >
                {returnTo.startsWith("/payroll/runs/new")
                  ? "Return to payroll run"
                  : returnTo === "/payroll"
                    ? "Go to Payroll"
                    : "Go to People"}
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
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

function MethodCard({
  icon: Icon,
  title,
  description,
  badge,
  onClick,
}: {
  icon: typeof Landmark
  title: string
  description: string
  badge?: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-2xl border bg-card p-6 text-left shadow-soft transition hover:border-primary/40 hover:shadow-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <div className="flex items-start justify-between">
        <span className="rounded-xl bg-primary/10 p-3 text-primary">
          <Icon className="h-6 w-6" />
        </span>
        {badge ? (
          <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">{badge}</span>
        ) : null}
      </div>
      <h2 className="mt-5 font-semibold">{title}</h2>
      <p className="mt-2 text-sm text-muted-foreground">{description}</p>
      <span className="mt-5 inline-flex items-center text-sm font-medium text-primary">
        Continue <ArrowRight className="ml-1 h-4 w-4" />
      </span>
    </button>
  )
}

function SetupSummary({
  method,
  profile,
  type,
  amount,
  currency,
  manualEmail,
}: {
  method: Method | null
  profile: PayrollEasetagProfile | null
  type: PayrollPersonType
  amount: string
  currency: string
  manualEmail?: string
}) {
  return (
    <Card className="h-fit shadow-soft lg:sticky lg:top-6">
      <CardContent className="p-5">
        <p className="text-sm font-medium">Setup summary</p>
        <dl className="mt-4 space-y-3 text-sm">
          <div className="flex justify-between gap-3">
            <dt className="text-muted-foreground">Method</dt>
            <dd>{method === "easetag" ? "EASETAG" : "Manual"}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-muted-foreground">Person</dt>
            <dd className="max-w-[180px] truncate">{profile?.fullName || manualEmail || "Manual person"}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-muted-foreground">Classification</dt>
            <dd className="capitalize">{type}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-muted-foreground">Amount</dt>
            <dd className="tabular-nums">{amount ? `${currency} ${Number(amount).toLocaleString()}` : "—"}</dd>
          </div>
        </dl>
      </CardContent>
    </Card>
  )
}
