"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { AlertCircle, ArrowLeft, ArrowRight, Check, Plus, Search } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { PayrollSubpageShell } from "@/components/payroll/payroll-subpage-shell"
import { PayrollReceivingMethod } from "@/components/payroll/payroll-receiving-method"
import { PayrollStatusBadge } from "@/components/payroll/payroll-status-badge"
import { PayrollFormSkeleton } from "@/components/payroll/payroll-page-skeleton"
import {
  usePayrollPeople,
  usePayrollRunDetail,
  usePayrollSchedules,
  usePayrollSettings,
  usePayrollTimingPreview,
} from "@/hooks/queries/use-payroll"
import { useCreatePayrollRun, usePreviewPayrollRun, useUpdatePayrollRun } from "@/hooks/mutations/use-payroll"
import { useBusinessAccountRows } from "@/hooks/use-business-account-rows"
import { useBusinessProfile } from "@/lib/use-business-profile"
import { formatCurrency, formatDate } from "@/lib/utils"
import type {
  PayrollRunDraftInput,
  PayrollRunPreview,
  PayrollTimingPreview,
} from "@/lib/payroll/types"
import { cn } from "@/lib/utils"
import {
  payrollPaydayPreview,
  payrollPayPeriodForPayday,
  type PayrollWeekendPolicy,
} from "@/lib/payroll/schedule-preview"

const stepLabels = ["Details", "People", "Amounts", "Readiness", "Review"]
type Draft = Omit<PayrollRunDraftInput, "lines"> & { amounts: Record<string, number>; selected: string[] }

function initialDraft(currency: string, accountId: string): Draft {
  const now = new Date()
  const end = now.toISOString().slice(0, 10)
  const startDate = new Date(now.getFullYear(), now.getMonth(), 1)
  return {
    name: `Payroll · ${now.toLocaleDateString(undefined, { month: "long", year: "numeric" })}`,
    offCycle: false,
    payPeriodStart: startDate.toISOString().slice(0, 10),
    payPeriodEnd: end,
    payday: end,
    sourceAccountId: accountId,
    sourceCurrency: currency,
    selected: [],
    amounts: {},
  }
}

export default function NewPayrollRunPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const editRunId = searchParams.get("edit")
  const profile = useBusinessProfile()
  const peopleQuery = usePayrollPeople()
  const schedules = usePayrollSchedules().data ?? []
  const payrollSettings = usePayrollSettings().data
  const accounts = useBusinessAccountRows()
  const createRun = useCreatePayrollRun()
  const updateRun = useUpdatePayrollRun(editRunId || "new")
  const editRunQuery = usePayrollRunDetail(editRunId)
  const editRun = editRunQuery.data
  const previewRun = usePreviewPayrollRun()
  const [step, setStep] = useState(0)
  const [search, setSearch] = useState("")
  const [draft, setDraft] = useState<Draft>(() => initialDraft(profile.baseCurrency || "USD", ""))
  const [preview, setPreview] = useState<PayrollRunPreview | null>(null)
  const [hydrated, setHydrated] = useState(false)
  const [addedPersonApplied, setAddedPersonApplied] = useState(false)
  const [sourceSettingsApplied, setSourceSettingsApplied] = useState(false)
  const timingQuery = usePayrollTimingPreview(draft.payday)
  const storageKey = `payroll_run_builder:${profile.businessId || "business"}${editRunId ? `:edit:${editRunId}` : ""}`
  const people = useMemo(() => peopleQuery.data ?? [], [peopleQuery.data])
  const ready = people.filter((person) => person.status === "active" && person.readinessStatus === "ready")
  const selectedPeople = draft.selected
    .map((id) => people.find((person) => person.id === id))
    .filter(Boolean) as typeof people
  const runInput: PayrollRunDraftInput = {
    name: draft.name,
    offCycle: draft.offCycle,
    scheduleId: draft.scheduleId || undefined,
    payPeriodStart: draft.payPeriodStart,
    payPeriodEnd: draft.payPeriodEnd,
    payday: draft.payday,
    sourceAccountId: draft.sourceAccountId,
    sourceCurrency: draft.sourceCurrency,
    lines: draft.selected.map((personId) => ({ personId, amount: Number(draft.amounts[personId] || 0) })),
  }

  useEffect(() => {
    if (!profile.businessId || hydrated) return
    if (editRunId) {
      if (editRunQuery.isPending || !editRun) return
      const persistedDraft = (() => {
        try {
          const saved = sessionStorage.getItem(storageKey)
          return saved ? (JSON.parse(saved) as Draft) : null
        } catch {
          return null
        }
      })()
      setDraft(
        persistedDraft ?? {
          name: String(editRun.metadata?.name || "Payroll run"),
          offCycle: Boolean(editRun.metadata?.offCycle),
          scheduleId: editRun.scheduleId || undefined,
          payPeriodStart: editRun.payPeriodStart?.slice(0, 10) || "",
          payPeriodEnd: editRun.payPeriodEnd?.slice(0, 10) || "",
          payday: editRun.payday?.slice(0, 10) || "",
          sourceAccountId: editRun.sourceAccountId || "",
          sourceCurrency: editRun.sourceCurrency,
          selected: (editRun.lines ?? [])
            .map((line) => line.personId)
            .filter((personId): personId is string => Boolean(personId)),
          amounts: Object.fromEntries(
            (editRun.lines ?? [])
              .filter((line) => Boolean(line.personId))
              .map((line) => [String(line.personId), line.amount]),
          ),
        },
      )
      setSourceSettingsApplied(true)
      setHydrated(true)
      return
    }
    try {
      const saved = sessionStorage.getItem(storageKey)
      if (saved) setDraft(JSON.parse(saved) as Draft)
      else {
        const first =
          accounts.accountRows.find((row) => row.currency === profile.baseCurrency) ?? accounts.accountRows[0]
        setDraft((current) => ({
          ...current,
          sourceCurrency: first?.currency ?? profile.baseCurrency ?? "USD",
          sourceAccountId: first?.id ?? "",
        }))
      }
    } catch {
      /* use defaults */
    }
    setHydrated(true)
  }, [
    accounts.accountRows,
    editRun,
    editRunId,
    editRunQuery.isPending,
    hydrated,
    profile.baseCurrency,
    profile.businessId,
    storageKey,
  ])

  useEffect(() => {
    if (!payrollSettings || sourceSettingsApplied) return
    const account =
      accounts.accountRows.find((row) => row.id === payrollSettings.defaultSourceAccountId) ??
      accounts.accountRows.find((row) => row.currency === payrollSettings.defaultCurrency)
    setDraft((current) => ({
      ...current,
      sourceAccountId: account?.id || payrollSettings.defaultSourceAccountId || current.sourceAccountId,
      sourceCurrency: account?.currency || payrollSettings.defaultCurrency,
    }))
    setSourceSettingsApplied(true)
  }, [accounts.accountRows, payrollSettings, sourceSettingsApplied])

  useEffect(() => {
    if (!hydrated) return
    sessionStorage.setItem(storageKey, JSON.stringify(draft))
  }, [draft, hydrated, storageKey])

  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (!draft.selected.length && !draft.name.trim()) return
      event.preventDefault()
    }
    window.addEventListener("beforeunload", warn)
    return () => window.removeEventListener("beforeunload", warn)
  }, [draft.name, draft.selected.length])

  useEffect(() => {
    const addedPersonId = searchParams.get("addedPerson")
    if (!addedPersonId || addedPersonApplied) return
    const person = people.find((item) => item.id === addedPersonId)
    if (!person) return
    setDraft((current) => ({
      ...current,
      selected: current.selected.includes(person.id) ? current.selected : [...current.selected, person.id],
      amounts: { ...current.amounts, [person.id]: current.amounts[person.id] || person.defaultAmount },
    }))
    setStep(1)
    setAddedPersonApplied(true)
    router.replace(editRunId ? `/payroll/runs/new?edit=${encodeURIComponent(editRunId)}` : "/payroll/runs/new")
  }, [addedPersonApplied, editRunId, people, router, searchParams])

  const detailsValid = Boolean(
    payrollSettings &&
    draft.name.trim() &&
    draft.payPeriodStart &&
    draft.payPeriodEnd &&
    (draft.scheduleId || draft.payday) &&
    draft.sourceAccountId,
  )
  const amountsValid = draft.selected.every((id) => Number(draft.amounts[id]) > 0)
  const filteredPeople = useMemo(() => {
    const q = search.trim().toLowerCase()
    return people.filter(
      (person) => !q || `${person.fullName} ${person.email ?? ""} ${person.easetag ?? ""}`.toLowerCase().includes(q),
    )
  }, [people, search])

  async function loadPreview(nextStep = true) {
    try {
      const result = await previewRun.mutateAsync(runInput)
      setPreview(result.preview)
      if (nextStep) setStep(3)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not check this payroll")
    }
  }

  async function persist() {
    try {
      const result =
        editRunId && editRun
          ? await updateRun.mutateAsync({ draft: runInput, revision: editRun.revision })
          : await createRun.mutateAsync(runInput)
      sessionStorage.removeItem(storageKey)
      toast.success(editRunId ? "Payroll run updated" : "Payroll run created")
      router.push(`/payroll/runs/${result.run.id}`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save payroll")
    }
  }

  function selectSchedule(scheduleId?: string) {
    if (!scheduleId) {
      setDraft((current) => ({ ...current, scheduleId: undefined }))
      setPreview(null)
      return
    }
    const schedule = schedules.find((item) => item.id === scheduleId)
    if (!schedule) return
    const weekendPolicy =
      schedule.template?.weekendPolicy === "next_business_day"
        ? "next_business_day"
        : "previous_business_day"
    const payday =
      payrollPaydayPreview({
        frequency: schedule.frequency,
        firstPayday: schedule.nextRunAt,
        weekendPolicy: weekendPolicy as PayrollWeekendPolicy,
        count: 1,
      })[0] ?? schedule.nextRunAt.slice(0, 10)
    const period = payrollPayPeriodForPayday(
      schedule.frequency,
      schedule.nextRunAt.slice(0, 10),
    )
    const included = ready.filter((person) => schedule.personIds?.includes(person.id))
    setDraft((current) => ({
      ...current,
      scheduleId,
      offCycle: false,
      payday,
      payPeriodStart: period?.start ?? current.payPeriodStart,
      payPeriodEnd: period?.end ?? current.payPeriodEnd,
      selected: included.map((person) => person.id),
      amounts: {
        ...current.amounts,
        ...Object.fromEntries(
          included.map((person) => [
            person.id,
            current.amounts[person.id] || person.defaultAmount,
          ]),
        ),
      },
    }))
    setPreview(null)
  }

  if (editRunId && editRunQuery.isPending && !editRun) {
    return <PayrollFormSkeleton />
  }
  if (editRunId && (!editRun || editRun.status !== "draft")) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
        <Card>
          <CardContent className="p-8 text-center">
            <h1 className="text-lg font-semibold">This payroll run can’t be edited</h1>
            <p className="mt-2 text-sm text-muted-foreground">Only draft payroll runs can be changed.</p>
            <Button className="mt-5" variant="outline" asChild>
              <Link href={editRun ? `/payroll/runs/${editRun.id}` : "/payroll/runs"}>Back to run</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <PayrollSubpageShell
      backHref={editRunId ? `/payroll/runs/${editRunId}` : "/payroll/runs"}
      backLabel={editRunId ? "Back to run" : "Back to Runs"}
      section="Runs"
      sectionHref="/payroll/runs"
      current={editRunId ? String(editRun?.metadata?.name || "Edit") : "Create"}
        title={editRunId ? "Edit payroll run" : "Run payroll"}
        description="Build, check, and approve a payroll run before any money moves."
      maxWidth="max-w-7xl"
    >
      <div className="mb-8 flex items-center gap-2 overflow-x-auto" aria-label="Payroll run steps">
        {stepLabels.map((label, index) => (
          <button
            type="button"
            key={label}
            onClick={() => index < step && setStep(index)}
            className="flex shrink-0 items-center gap-2"
          >
            <span
              className={cn(
                "flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold",
                index <= step ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
              )}
            >
              {index < step ? <Check className="h-4 w-4" /> : index + 1}
            </span>
            <span className={cn("text-sm", index <= step ? "text-foreground" : "text-muted-foreground")}>{label}</span>
            {index < 4 ? <span className="h-px w-7 bg-border md:w-12" /> : null}
          </button>
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <Card className="shadow-card">
          <CardContent className="p-6 sm:p-8">
            {step === 0 ? (
              <DetailsStep
                draft={draft}
                setDraft={setDraft}
                accounts={accounts.accountRows}
                schedules={schedules}
                onSelectSchedule={selectSchedule}
              />
            ) : null}
            {step === 1 ? (
              <PeopleStep
                addPersonHref={`/payroll/people/new?returnTo=${encodeURIComponent(editRunId ? `/payroll/runs/new?edit=${editRunId}` : "/payroll/runs/new")}`}
                people={filteredPeople}
                selected={draft.selected}
                search={search}
                setSearch={setSearch}
                onToggle={(personId, defaultAmount) =>
                  setDraft((current) => {
                    const selected = current.selected.includes(personId)
                      ? current.selected.filter((id) => id !== personId)
                      : [...current.selected, personId]
                    return {
                      ...current,
                      selected,
                      amounts: { ...current.amounts, [personId]: current.amounts[personId] || defaultAmount },
                    }
                  })
                }
                onSelectAll={() =>
                  setDraft((current) => ({
                    ...current,
                    selected: ready.map((person) => person.id),
                    amounts: Object.fromEntries(
                      ready.map((person) => [person.id, current.amounts[person.id] || person.defaultAmount]),
                    ),
                  }))
                }
              />
            ) : null}
            {step === 2 ? <AmountsStep people={selectedPeople} draft={draft} setDraft={setDraft} /> : null}
            {step === 3 ? (
              <ReadinessStep
                preview={preview}
                payday={draft.payday}
                currency={draft.sourceCurrency}
                onRefresh={() => void loadPreview(false)}
              />
            ) : null}
            {step === 4 ? (
              <ReviewStep
                draft={draft}
                people={selectedPeople}
                preview={preview}
                timing={timingQuery.data ?? null}
              />
            ) : null}

            <div className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t pt-5">
              <Button variant="ghost" onClick={() => setStep((value) => Math.max(0, value - 1))} disabled={step === 0}>
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back
              </Button>
              <div className="flex flex-wrap gap-2">
                {step === 4 ? (
                  <>
                    <Button
                      variant="primary"
                      onClick={() => void persist()}
                      disabled={createRun.isPending || updateRun.isPending}
                    >
                      {createRun.isPending || updateRun.isPending
                        ? "Saving…"
                        : editRunId
                          ? "Save changes"
                          : "Create run"}
                    </Button>
                  </>
                ) : (
                  <Button
                    variant="primary"
                    onClick={() => {
                      if (step === 2) void loadPreview()
                      else if (step === 3) setStep(4)
                      else setStep((value) => Math.min(4, value + 1))
                    }}
                    disabled={
                      (step === 0 && !detailsValid) ||
                      (step === 1 && !draft.selected.length) ||
                      (step === 2 && !amountsValid) ||
                      previewRun.isPending
                    }
                  >
                    {step === 2
                      ? previewRun.isPending
                        ? "Checking…"
                        : "Check readiness"
                      : step === 3
                        ? "Review payroll"
                        : "Continue"}
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
        <RunSummary
          draft={draft}
          people={selectedPeople}
          preview={preview}
          timing={timingQuery.data ?? null}
        />
      </div>
    </PayrollSubpageShell>
  )
}

function DetailsStep({
  draft,
  setDraft,
  accounts,
  schedules,
  onSelectSchedule,
}: {
  draft: Draft
  setDraft: React.Dispatch<React.SetStateAction<Draft>>
  accounts: Array<{ id: string; currency: string; availableBalance?: number; balance: number }>
  schedules: ReturnType<typeof usePayrollSchedules>["data"]
  onSelectSchedule: (scheduleId?: string) => void
}) {
  const update = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((current) => ({ ...current, [key]: value }))
  const sourceAccount = accounts.find((account) => account.id === draft.sourceAccountId)
  const selectedSchedule = (schedules ?? []).find((schedule) => schedule.id === draft.scheduleId)
  return (
    <div>
      <h2 className="text-lg font-semibold">Payroll details</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Choose a schedule for its next payroll occurrence, or set the dates for a one-time run.
      </p>
      <div className="mt-6 space-y-5">
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Run name">
            <Input value={draft.name} onChange={(e) => update("name", e.target.value)} />
          </Field>
          <Field label="Source account">
            <div className="flex h-10 items-center justify-between rounded-md border bg-muted/40 px-3 text-sm">
              <span>{draft.sourceCurrency} account</span>
              <span className="text-muted-foreground">
                {sourceAccount
                  ? `${formatCurrency(sourceAccount.availableBalance ?? sourceAccount.balance, sourceAccount.currency)} available`
                  : "Set in Payroll Settings"}
              </span>
            </div>
            <Link className="text-xs text-primary hover:underline" href="/payroll/settings">
              Change in Payroll Settings
            </Link>
          </Field>
          <Field label="Run type">
            <Select
              value={draft.offCycle ? "off-cycle" : "regular"}
              onValueChange={(v) => update("offCycle", v === "off-cycle")}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="regular">Regular payroll</SelectItem>
                <SelectItem value="off-cycle">Off-cycle payroll</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="Schedule (optional)">
            <Select
              value={draft.scheduleId || "none"}
              onValueChange={(value) => onSelectSchedule(value === "none" ? undefined : value)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No schedule · one-time run</SelectItem>
                {(schedules ?? []).filter((schedule) => schedule.active).map((schedule) => (
                  <SelectItem key={schedule.id} value={schedule.id}>
                    {schedule.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </div>
        {draft.scheduleId ? (
          <div className="rounded-xl border bg-muted/30 p-4">
            <p className="text-sm font-medium">{selectedSchedule?.name || "Selected schedule"}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              This run uses the schedule’s next pay period and payday. The schedule will continue creating
              future payroll drafts until it is paused.
            </p>
            <dl className="mt-4 grid gap-4 sm:grid-cols-2">
              <ReviewItem
                label="Pay period"
                value={`${formatDate(draft.payPeriodStart)} – ${formatDate(draft.payPeriodEnd)}`}
              />
              <ReviewItem label="Next payday" value={formatDate(draft.payday)} />
            </dl>
          </div>
        ) : (
          <div className="grid gap-5 md:grid-cols-3">
            <Field label="Pay period start">
              <Input
                type="date"
                value={draft.payPeriodStart}
                onChange={(e) => update("payPeriodStart", e.target.value)}
              />
            </Field>
            <Field label="Pay period end">
              <Input type="date" value={draft.payPeriodEnd} onChange={(e) => update("payPeriodEnd", e.target.value)} />
            </Field>
            <Field label="Payday">
              <Input type="date" value={draft.payday} onChange={(e) => update("payday", e.target.value)} />
            </Field>
          </div>
        )}
      </div>
    </div>
  )
}

function PeopleStep({
  people,
  selected,
  search,
  setSearch,
  onToggle,
  onSelectAll,
  addPersonHref,
}: {
  people: ReturnType<typeof usePayrollPeople>["data"]
  selected: string[]
  search: string
  setSearch: (value: string) => void
  onToggle: (id: string, amount: number) => void
  onSelectAll: () => void
  addPersonHref: string
}) {
  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Choose people</h2>
          <p className="mt-1 text-sm text-muted-foreground">Only people who are ready can be selected.</p>
        </div>
        <Button variant="outline" size="sm" onClick={onSelectAll}>
          Select all ready
        </Button>
      </div>
      <div className="relative mt-5">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          className="pl-9"
          placeholder="Search people"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>
      <div className="mt-4 divide-y rounded-xl border">
        {(people ?? []).map((person) => {
          const isReady = person.status === "active" && person.readinessStatus === "ready"
          return (
            <label
              key={person.id}
              className={cn("flex items-center gap-3 p-4", isReady ? "cursor-pointer hover:bg-muted/40" : "opacity-60")}
            >
              <input
                type="checkbox"
                checked={selected.includes(person.id)}
                disabled={!isReady}
                onChange={() => onToggle(person.id, person.defaultAmount)}
              />
              <span className="min-w-0 flex-1">
                <span className="block font-medium">{person.fullName}</span>
                <span className="block text-xs text-muted-foreground">
                  <PayrollReceivingMethod person={person} typeOnly />
                </span>
              </span>
              <PayrollStatusBadge status={person.status !== "active" ? person.status : person.readinessStatus} />
            </label>
          )
        })}
      </div>
      <Button className="mt-4" variant="outline" asChild>
        <Link href={addPersonHref}>
          <Plus className="mr-2 h-4 w-4" />
          Add a person
        </Link>
      </Button>
    </div>
  )
}

function AmountsStep({
  people,
  draft,
  setDraft,
}: {
  people: NonNullable<ReturnType<typeof usePayrollPeople>["data"]>
  draft: Draft
  setDraft: React.Dispatch<React.SetStateAction<Draft>>
}) {
  return (
    <div>
      <div className="flex items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Amounts</h2>
          <p className="mt-1 text-sm text-muted-foreground">Confirm what each person receives.</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() =>
            setDraft((current) => ({
              ...current,
              amounts: Object.fromEntries(people.map((person) => [person.id, person.defaultAmount])),
            }))
          }
        >
          Use saved amounts
        </Button>
      </div>
      <div className="mt-5 divide-y rounded-xl border">
        {people.map((person) => (
          <div key={person.id} className="grid gap-3 p-4 sm:grid-cols-[minmax(0,1fr)_150px] sm:items-center">
            <div>
              <p className="font-medium">{person.fullName}</p>
              <div className="mt-1 text-xs text-muted-foreground">
                <PayrollReceivingMethod person={person} typeOnly /> · {draft.sourceCurrency}
              </div>
            </div>
            <Input
              inputMode="decimal"
              className="tabular-nums"
              value={String(draft.amounts[person.id] || "")}
              onChange={(e) =>
                setDraft((current) => ({
                  ...current,
                  amounts: { ...current.amounts, [person.id]: Number(e.target.value.replace(/[^\d.]/g, "")) },
                }))
              }
            />
          </div>
        ))}
      </div>
    </div>
  )
}

function ReadinessStep({
  preview,
  payday,
  currency,
  onRefresh,
}: {
  preview: PayrollRunPreview | null
  payday: string
  currency: string
  onRefresh: () => void
}) {
  const shortfall = preview ? Math.max(0, preview.sourceDebit - preview.availableBalance) : 0
  const isFunded = Boolean(preview && shortfall <= 0)
  const paymentIssues =
    preview?.issues.filter((issue) => issue.code !== "insufficient_funds") ?? []

  return (
    <div>
      <div className="flex items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Readiness</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Check whether the selected account can cover this payroll.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={onRefresh}>
          Check again
        </Button>
      </div>

      {preview ? (
        <div
          className={cn(
            "mt-6 rounded-2xl border p-6",
            isFunded
              ? "border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-100"
              : "border-amber-200 bg-amber-50 text-amber-950 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100",
          )}
        >
          <div className="flex items-start gap-3">
            {isFunded ? (
              <Check className="mt-0.5 h-5 w-5 shrink-0" />
            ) : (
              <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
            )}
            <div className="min-w-0 flex-1">
              <p className="font-medium">
                {isFunded ? "Balance can cover this payroll" : "Funding needed before payday"}
              </p>
              <p className="mt-1 text-sm opacity-80">
                {isFunded
                  ? `The selected account can cover the ${formatCurrency(preview.sourceDebit, currency)} total.`
                  : `This run can still be saved and approved. Add ${formatCurrency(shortfall, currency)} before ${formatDate(payday)}. If the funds are not available when payroll is due, the run will not be sent and the business will be notified.`}
              </p>
              <dl className="mt-5 grid gap-4 border-t border-current/15 pt-4 sm:grid-cols-3">
                <FundingValue
                  label="Available balance"
                  value={formatCurrency(preview.availableBalance, currency)}
                />
                <FundingValue
                  label="Payroll total"
                  value={formatCurrency(preview.sourceDebit, currency)}
                />
                <FundingValue
                  label={isFunded ? "Balance after payroll" : "Amount to fund"}
                  value={formatCurrency(
                    isFunded ? Math.max(0, preview.remainingBalance) : shortfall,
                    currency,
                  )}
                />
              </dl>
              {!isFunded ? (
                <Button className="mt-5" variant="outline" size="sm" asChild>
                  <Link href="/accounts">View accounts</Link>
                </Button>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {paymentIssues.length ? (
        <div className="mt-5 space-y-3">
          <p className="text-sm font-medium">Payment details need attention</p>
          {paymentIssues.map((issue, index) => (
            <div
              key={`${issue.code}-${issue.personId}-${index}`}
              className="flex items-start justify-between gap-4 rounded-xl border p-4"
            >
              <div className="flex gap-3">
                <AlertCircle
                  className={cn(
                    "mt-0.5 h-4 w-4",
                    issue.severity === "blocking" ? "text-destructive" : "text-amber-600",
                  )}
                />
                <div>
                  <p className="text-sm font-medium">Review payment details</p>
                  <p className="mt-1 text-xs text-muted-foreground">{issue.message}</p>
                </div>
              </div>
              {issue.actionHref ? (
                <Button variant="outline" size="sm" asChild>
                  <Link href={issue.actionHref}>{issue.actionLabel || "Resolve"}</Link>
                </Button>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  )
}

function FundingValue({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs opacity-70">{label}</dt>
      <dd className="mt-1 text-sm font-semibold tabular-nums">{value}</dd>
    </div>
  )
}

function ReviewStep({
  draft,
  people,
  preview,
  timing,
}: {
  draft: Draft
  people: NonNullable<ReturnType<typeof usePayrollPeople>["data"]>
  preview: PayrollRunPreview | null
  timing: PayrollTimingPreview | null
}) {
  const schedulesForLater = Boolean(
    timing?.scheduledAt && new Date(timing.scheduledAt).getTime() > Date.now(),
  )
  return (
    <div>
      <h2 className="text-lg font-semibold">Review payroll</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Confirm the approved payroll details before saving or sending for approval.
      </p>
      <dl className="mt-6 grid gap-5 rounded-xl border p-5 sm:grid-cols-3">
        <ReviewItem
          label="Pay period"
          value={`${formatDate(draft.payPeriodStart)} – ${formatDate(draft.payPeriodEnd)}`}
        />
        <ReviewItem label={draft.scheduleId ? "Scheduled payday" : "Payday"} value={formatDate(draft.payday)} />
        <ReviewItem
          label="Payment timing"
          value={
            schedulesForLater
              ? timing?.display ?? "Calculated when approved"
              : "Immediately after approval"
          }
        />
        {schedulesForLater ? (
          <ReviewItem label="UTC execution" value={timing?.scheduledAt ?? "Calculated when approved"} />
        ) : null}
        <ReviewItem label="People" value={String(people.length)} />
        <ReviewItem label="Amount" value={formatCurrency(preview?.payrollTotal ?? 0, draft.sourceCurrency)} />
        <ReviewItem label="Fees" value={formatCurrency(preview?.fees ?? 0, draft.sourceCurrency)} />
        <ReviewItem label="Total debit" value={formatCurrency(preview?.sourceDebit ?? 0, draft.sourceCurrency)} />
      </dl>
      <div className="mt-5 divide-y rounded-xl border">
        {people.map((person) => (
          <div key={person.id} className="flex items-center justify-between gap-4 p-4">
            <div>
              <p className="font-medium">{person.fullName}</p>
              <PayrollReceivingMethod person={person} typeOnly />
            </div>
            <p className="font-medium tabular-nums">
              {formatCurrency(draft.amounts[person.id] || 0, draft.sourceCurrency)}
            </p>
          </div>
        ))}
      </div>
    </div>
  )
}

function RunSummary({
  draft,
  people,
  preview,
  timing,
}: {
  draft: Draft
  people: NonNullable<ReturnType<typeof usePayrollPeople>["data"]>
  preview: PayrollRunPreview | null
  timing: PayrollTimingPreview | null
}) {
  const total = people.reduce((sum, person) => sum + Number(draft.amounts[person.id] || 0), 0)
  const schedulesForLater = Boolean(
    timing?.scheduledAt && new Date(timing.scheduledAt).getTime() > Date.now(),
  )
  return (
    <Card className="h-fit shadow-soft xl:sticky xl:top-6">
      <CardContent className="p-5">
        <p className="font-medium">Payroll summary</p>
        <dl className="mt-5 space-y-4 text-sm">
          <ReviewItem label="People" value={String(people.length)} row />
          <ReviewItem label="Amount" value={formatCurrency(total, draft.sourceCurrency)} row />
          <ReviewItem label="Fees" value={formatCurrency(preview?.fees ?? 0, draft.sourceCurrency)} row />
          <div className="border-t pt-4">
            <ReviewItem
              label="Total debit"
              value={formatCurrency(preview?.sourceDebit ?? total, draft.sourceCurrency)}
              row
              strong
            />
          </div>
          <ReviewItem
            label="Available balance"
            value={preview ? formatCurrency(preview.availableBalance, draft.sourceCurrency) : "Checked at readiness"}
            row
          />
          <ReviewItem
            label={draft.scheduleId ? "Scheduled payday" : "Payday"}
            value={draft.payday ? formatDate(draft.payday) : "—"}
            row
          />
          <ReviewItem
            label="Payment time"
            value={
              schedulesForLater
                ? timing?.display ?? "Calculated at approval"
                : "After approval"
            }
            row
          />
        </dl>
      </CardContent>
    </Card>
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
function ReviewItem({ label, value, row, strong }: { label: string; value: string; row?: boolean; strong?: boolean }) {
  return (
    <div className={row ? "flex items-center justify-between gap-4" : ""}>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={cn("mt-1 text-sm", row && "mt-0", strong && "font-semibold")}>{value}</dd>
    </div>
  )
}
