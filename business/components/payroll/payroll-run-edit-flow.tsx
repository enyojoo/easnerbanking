"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { ArrowLeft } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { PayrollPageHeader } from "@/components/payroll/payroll-page-header"
import { PayrollReceivingMethod } from "@/components/payroll/payroll-receiving-method"
import { useUpdatePayrollRun } from "@/hooks/mutations/use-payroll"
import { usePayrollCapabilities, usePayrollPeople, usePayrollRunDetail } from "@/hooks/queries/use-payroll"
import { formatCurrency } from "@/lib/utils"

export function PayrollRunEditFlow({ runId }: { runId: string }) {
  const router = useRouter()
  const runQuery = usePayrollRunDetail(runId)
  const peopleQuery = usePayrollPeople()
  const capabilitiesQuery = usePayrollCapabilities()
  const updateRun = useUpdatePayrollRun(runId)
  const run = runQuery.data
  const lines = useMemo(() => run?.lines ?? [], [run?.lines])
  const peopleById = useMemo(
    () => new Map((peopleQuery.data ?? []).map((person) => [person.id, person])),
    [peopleQuery.data],
  )
  const [initializedRevision, setInitializedRevision] = useState<number | null>(null)
  const [name, setName] = useState("")
  const [payPeriodStart, setPayPeriodStart] = useState("")
  const [payPeriodEnd, setPayPeriodEnd] = useState("")
  const [payday, setPayday] = useState("")
  const [amounts, setAmounts] = useState<Record<string, string>>({})
  const [dirty, setDirty] = useState(false)

  useEffect(() => {
    if (!run || initializedRevision !== null) return
    setName(String(run.metadata?.name || "Payroll run"))
    setPayPeriodStart(run.payPeriodStart?.slice(0, 10) || "")
    setPayPeriodEnd(run.payPeriodEnd?.slice(0, 10) || "")
    setPayday(run.payday?.slice(0, 10) || "")
    setAmounts(Object.fromEntries((run.lines ?? []).map((line) => [line.id, String(line.amount)])))
    setInitializedRevision(run.revision)
  }, [initializedRevision, run])

  useEffect(() => {
    if (!dirty) return
    const warn = (event: BeforeUnloadEvent) => event.preventDefault()
    window.addEventListener("beforeunload", warn)
    return () => window.removeEventListener("beforeunload", warn)
  }, [dirty])

  if (runQuery.isPending || peopleQuery.isPending || capabilitiesQuery.isPending) {
    return <div className="mx-auto max-w-6xl px-4 py-12 text-sm text-muted-foreground">Loading payroll run…</div>
  }
  if (!run) {
    return <div className="mx-auto max-w-6xl px-4 py-12"><p className="font-medium">This payroll run could not be found.</p><Button className="mt-4" variant="outline" asChild><Link href="/payroll/runs">Back to Runs</Link></Button></div>
  }
  if (run.status !== "draft") {
    return <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6"><Card><CardContent className="p-8 text-center"><h1 className="text-lg font-semibold">This payroll run can’t be edited</h1><p className="mt-2 text-sm text-muted-foreground">Only draft payroll runs can be changed.</p><Button className="mt-5" variant="outline" asChild><Link href={`/payroll/runs/${run.id}`}>Back to run</Link></Button></CardContent></Card></div>
  }
  if (!capabilitiesQuery.data?.canPrepare) {
    return <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6"><Card><CardContent className="p-8 text-center"><h1 className="text-lg font-semibold">You can’t edit payroll runs</h1><p className="mt-2 text-sm text-muted-foreground">Ask a Payroll preparer or approver to update this draft.</p><Button className="mt-5" variant="outline" asChild><Link href={`/payroll/runs/${run.id}`}>Back to run</Link></Button></CardContent></Card></div>
  }
  const currentRun = run

  const total = lines.reduce((sum, line) => sum + Number(amounts[line.id] || 0), 0)
  const invalidAmount = lines.some((line) => !Number.isFinite(Number(amounts[line.id])) || Number(amounts[line.id]) <= 0)
  const invalidDates = Boolean(payPeriodStart && payPeriodEnd && payPeriodStart > payPeriodEnd)
  const canSave = name.trim() && payPeriodStart && payPeriodEnd && payday && !invalidAmount && !invalidDates

  function setField(update: () => void) {
    update()
    setDirty(true)
  }

  function save() {
    if (!canSave) return
    updateRun.mutate({
      revision: currentRun.revision,
      name: name.trim(),
      payPeriodStart,
      payPeriodEnd,
      payday,
      lines: lines.map((line) => ({ id: line.id, amount: Number(amounts[line.id]) })),
    }, {
      onSuccess: () => {
        setDirty(false)
        toast.success("Payroll run updated")
        router.push(`/payroll/runs/${currentRun.id}`)
      },
      onError: (error) => toast.error(error.message),
    })
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <Button variant="ghost" size="sm" className="mb-4" asChild>
        <Link href={`/payroll/runs/${run.id}`}><ArrowLeft className="mr-2 h-4 w-4" />Back to run</Link>
      </Button>
      <PayrollPageHeader
        title="Edit payroll run"
        description="Update the details and amounts in this draft before submitting it for approval."
      />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-6">
          <Card className="shadow-card">
            <CardContent className="space-y-5 p-6 sm:p-8">
              <div>
                <p className="text-sm font-semibold">Payroll details</p>
                <p className="mt-1 text-sm text-muted-foreground">The source account and currency were set when this run was created.</p>
              </div>
              <div className="grid gap-5 sm:grid-cols-2">
                <Field label="Name">
                  <Input value={name} onChange={(event) => setField(() => setName(event.target.value))} />
                </Field>
                <Field label="Source account">
                  <div className="flex h-10 items-center rounded-md border bg-muted/30 px-3 text-sm">
                    {run.sourceCurrency} account
                  </div>
                </Field>
              </div>
              <div className="grid gap-5 md:grid-cols-3">
                <Field label="Pay period start">
                  <Input type="date" value={payPeriodStart} onChange={(event) => setField(() => setPayPeriodStart(event.target.value))} />
                </Field>
                <Field label="Pay period end">
                  <Input type="date" value={payPeriodEnd} onChange={(event) => setField(() => setPayPeriodEnd(event.target.value))} />
                </Field>
                <Field label="Payday">
                  <Input type="date" value={payday} onChange={(event) => setField(() => setPayday(event.target.value))} />
                </Field>
              </div>
              {invalidDates ? <p className="text-sm text-destructive">Pay period end must be on or after the start date.</p> : null}
            </CardContent>
          </Card>

          <Card className="shadow-card">
            <CardContent className="p-0">
              <div className="border-b px-6 py-5 sm:px-8">
                <p className="text-sm font-semibold">People and amounts</p>
                <p className="mt-1 text-sm text-muted-foreground">Update the amount for each person included in this draft.</p>
              </div>
              <div className="divide-y">
                {lines.map((line) => {
                  const person = line.personId ? peopleById.get(line.personId) : undefined
                  return (
                    <div key={line.id} className="grid gap-4 px-6 py-5 sm:grid-cols-[minmax(0,1fr)_180px] sm:items-center sm:px-8">
                      <div className="min-w-0">
                        <p className="font-medium">{line.personName || person?.fullName || "Person"}</p>
                        {person ? <div className="mt-1"><PayrollReceivingMethod person={person} /></div> : null}
                      </div>
                      <Field label="Amount">
                        <div className="relative">
                          <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm font-medium text-muted-foreground">{run.sourceCurrency}</span>
                          <Input
                            className="pl-14 tabular-nums"
                            inputMode="decimal"
                            value={amounts[line.id] ?? ""}
                            onChange={(event) => setField(() => setAmounts((current) => ({ ...current, [line.id]: event.target.value.replace(/[^\d.]/g, "") })))}
                          />
                        </div>
                      </Field>
                    </div>
                  )
                })}
              </div>
            </CardContent>
          </Card>

          <div className="flex justify-end gap-2">
            <Button variant="outline" asChild><Link href={`/payroll/runs/${run.id}`}>Cancel</Link></Button>
            <Button variant="primary" disabled={!canSave || updateRun.isPending} onClick={save}>
              {updateRun.isPending ? "Saving…" : "Save changes"}
            </Button>
          </div>
        </div>

        <Card className="h-fit shadow-soft lg:sticky lg:top-6">
          <CardContent className="p-5">
            <p className="text-sm font-medium">Run summary</p>
            <dl className="mt-4 space-y-3 text-sm">
              <Summary label="People" value={String(lines.length)} />
              <Summary label="Amount" value={formatCurrency(total, run.sourceCurrency)} />
              <Summary label="Payday" value={payday || "—"} />
              <Summary label="Currency" value={run.sourceCurrency} />
            </dl>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-2"><Label>{label}</Label>{children}</div>
}

function Summary({ label, value }: { label: string; value: string }) {
  return <div className="flex justify-between gap-3"><dt className="text-muted-foreground">{label}</dt><dd className="text-right">{value}</dd></div>
}
