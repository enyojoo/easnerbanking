"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { useParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { PayrollNavTabs } from "@/components/payroll/payroll-nav-tabs"
import { PayrollLegalNote } from "@/components/payroll/payroll-legal-note"
import { PayrollLineStatusBadge, PayrollRunStatusBadge } from "@/components/payroll/payroll-run-status-badge"
import { PayrollRailBadge } from "@/components/payroll/payroll-rail-badge"
import { usePayrollCapabilities, usePayrollRunDetail } from "@/hooks/queries/use-payroll"
import {
  useUpdatePayrollRun,
  useSubmitPayrollRun,
  useApprovePayrollRun,
  useExecutePayrollRun,
  useRetryPayrollRun,
  useWithdrawPayrollRun,
} from "@/hooks/mutations/use-payroll"
import { useConfirmWithPin } from "@/components/app-lock/use-confirm-with-pin"
import { PinChallengeDialog } from "@/components/app-lock/pin-challenge-dialog"
import { useAuth } from "@/lib/auth-context"
import { formatCurrency, formatDate } from "@/lib/utils"
import { toast } from "sonner"
import type { PayrollLine } from "@/lib/payroll/types"
import { apiFetch } from "@/lib/query/api-client"

export default function PayrollRunDetailPage() {
  const params = useParams<{ id: string }>()
  const runId = params.id
  const runQuery = usePayrollRunDetail(runId)
  const capabilities = usePayrollCapabilities().data
  const canPrepare = Boolean(capabilities?.enabled && capabilities.canPrepare)
  const canApprove = Boolean(capabilities?.enabled && capabilities.canApprove)
  const updateRun = useUpdatePayrollRun(runId)
  const submitRun = useSubmitPayrollRun(runId)
  const approveRun = useApprovePayrollRun(runId)
  const executeRun = useExecutePayrollRun(runId)
  const retryRun = useRetryPayrollRun(runId)
  const withdrawRun = useWithdrawPayrollRun(runId)
  const { user } = useAuth()
  const confirmWithPin = useConfirmWithPin()

  const run = runQuery.data
  const [amountEdits, setAmountEdits] = useState<Record<string, string>>({})
  const [runName, setRunName] = useState("")
  const [payPeriodStart, setPayPeriodStart] = useState("")
  const [payPeriodEnd, setPayPeriodEnd] = useState("")
  const [payday, setPayday] = useState("")
  const [detailsDirty, setDetailsDirty] = useState(false)
  const hasUnsavedChanges = Object.keys(amountEdits).length > 0 || detailsDirty

  const lines = useMemo(() => run?.lines ?? [], [run?.lines])
  const failedLines = lines.filter((l) => l.status === "failed")
  const hasPayStubs = lines.some((line) => Boolean(line.payrollDocumentId))
  const awaitingApproval = run?.status === "pending_approval" || run?.status === "needs_reapproval"

  const railSummary = useMemo(() => {
    const mix: Record<string, number> = {}
    for (const line of lines) {
      mix[line.rail] = (mix[line.rail] ?? 0) + 1
    }
    return Object.entries(mix)
      .map(([rail, n]) => `${n} ${rail}`)
      .join(" · ")
  }, [lines])

  async function saveAmounts() {
    const patchLines = Object.entries(amountEdits)
      .map(([id, amount]) => ({ id, amount: Number(amount) }))
      .filter((l) => Number.isFinite(l.amount) && l.amount > 0)
    if (patchLines.length === 0 && !detailsDirty) return
    try {
      await updateRun.mutateAsync({
        lines: patchLines,
        revision: run?.revision,
        name: runName || undefined,
        payPeriodStart: payPeriodStart || undefined,
        payPeriodEnd: payPeriodEnd || undefined,
        payday: payday || undefined,
      })
      toast.success("Amounts updated")
      setAmountEdits({})
      setDetailsDirty(false)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Update failed")
    }
  }

  async function handleExecute() {
    if (!(await confirmWithPin.requestConfirm())) return
    try {
      await executeRun.mutateAsync()
      toast.success("Payroll executed")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Execute failed")
    }
  }

  async function handleApproveAndPay() {
    if (!(await confirmWithPin.requestConfirm())) return
    try {
      await approveRun.mutateAsync({ mode: "pay_now" })
      await executeRun.mutateAsync()
      toast.success("Payroll approved and sent")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Payroll could not be sent")
    }
  }

  async function handleApproveAndSchedule() {
    if (!run) return
    if (!(await confirmWithPin.requestConfirm())) return
    const date = run.payday || run.scheduledFor
    if (!date) {
      toast.error("Choose a payday before scheduling")
      return
    }
    try {
      await approveRun.mutateAsync({
        mode: "schedule",
        scheduledAt: `${date.slice(0, 10)}T09:00:00.000Z`,
      })
      toast.success("Payroll approved and scheduled")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Payroll could not be scheduled")
    }
  }

  async function downloadPayStub(documentId: string) {
    try {
      const response = await apiFetch<{ document: { downloadUrl: string } }>(
        `/api/payroll/documents/${documentId}?download=1`,
      )
      window.open(response.document.downloadUrl, "_blank", "noopener,noreferrer")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not download pay stub")
    }
  }

  async function resendPayStub(documentId: string) {
    try {
      await apiFetch(`/api/business/payroll/documents/${documentId}/resend`, { method: "POST" })
      toast.success("Pay stub email queued")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not resend pay stub")
    }
  }

  if (runQuery.isLoading) {
    return <div className="mx-auto max-w-6xl px-4 py-8 text-sm text-muted-foreground">Loading run…</div>
  }

  if (!run) {
    return <div className="mx-auto max-w-6xl px-4 py-8 text-sm text-muted-foreground">Run not found.</div>
  }

  const editable = run.status === "draft"

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <Link href="/payroll/runs" className="text-sm text-muted-foreground hover:text-foreground">
            ← Runs
          </Link>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight tabular-nums">
            {formatCurrency(run.totalSource, run.sourceCurrency)}
          </h1>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <PayrollRunStatusBadge status={run.status} />
            <span className="text-sm text-muted-foreground">{railSummary}</span>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {hasPayStubs ? (
            <Button variant="outline" asChild>
              <a href={`/api/business/payroll/runs/${runId}/documents/export`} download>
                Download pay stubs
              </a>
            </Button>
          ) : null}
          {run.status === "draft" && canPrepare ? (
            <>
              <Button variant="outline" onClick={() => void saveAmounts()} disabled={updateRun.isPending}>
                Save amounts
              </Button>
              <Button
                variant="primary"
                onClick={() =>
                  submitRun.mutate(undefined, {
                    onSuccess: () => toast.success("Submitted for approval"),
                    onError: (e) => toast.error(e.message),
                  })
                }
                disabled={submitRun.isPending || hasUnsavedChanges}
              >
                Submit for approval
              </Button>
            </>
          ) : null}
          {awaitingApproval && canPrepare ? (
              <Button
                variant="outline"
                onClick={() => withdrawRun.mutate(undefined, {
                  onSuccess: () => toast.success("Run returned to draft"),
                  onError: (e) => toast.error(e.message),
                })}
                disabled={withdrawRun.isPending}
              >
                Withdraw
              </Button>
          ) : null}
          {awaitingApproval && canApprove ? (
            <>
              <Button
                variant="outline"
                onClick={() => void handleApproveAndSchedule()}
                disabled={approveRun.isPending || !(run.payday || run.scheduledFor)}
              >
                Approve and schedule
              </Button>
              <Button
                variant="primary"
                onClick={() => void handleApproveAndPay()}
                disabled={approveRun.isPending || executeRun.isPending}
              >
                Approve and pay
              </Button>
            </>
          ) : null}
          {(run.status === "approved" || run.status === "partial") && canApprove ? (
            <Button variant="primary" onClick={() => void handleExecute()} disabled={executeRun.isPending}>
              Execute with PIN
            </Button>
          ) : null}
          {failedLines.length > 0 && canApprove ? (
            <Button
              variant="outline"
              onClick={() =>
                retryRun.mutate(
                  failedLines.map((l) => l.id),
                  {
                    onSuccess: (res) => toast.success(`Retried ${res.retried.length} payments`),
                    onError: (e) => toast.error(e.message),
                  },
                )
              }
            >
              Retry failed
            </Button>
          ) : null}
        </div>
      </div>

      <PayrollNavTabs />

      {run.shortfall > 0 ? (
        <Card className="shadow-soft border-amber-200/60 mb-4">
          <CardContent className="p-4 text-sm text-amber-800 dark:text-amber-300">
            Need {formatCurrency(run.shortfall, run.sourceCurrency)} more in {run.sourceCurrency} before
            execute.
          </CardContent>
        </Card>
      ) : null}

      {run.status === "draft" && canPrepare ? (
        <Card className="shadow-soft mb-4">
          <CardContent className="p-4">
            <p className="text-sm font-medium mb-3">1. Payroll details</p>
            <div className="grid gap-3 sm:grid-cols-4">
              <Input placeholder="Run name" value={runName} onChange={(e) => { setRunName(e.target.value); setDetailsDirty(true) }} />
              <Input aria-label="Pay period start" type="date" value={payPeriodStart} onChange={(e) => { setPayPeriodStart(e.target.value); setDetailsDirty(true) }} />
              <Input aria-label="Pay period end" type="date" value={payPeriodEnd} onChange={(e) => { setPayPeriodEnd(e.target.value); setDetailsDirty(true) }} />
              <Input aria-label="Payday" type="date" value={payday} onChange={(e) => { setPayday(e.target.value); setDetailsDirty(true) }} />
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              Save payroll details and amount changes before submitting for approval.
            </p>
          </CardContent>
        </Card>
      ) : null}

      <Card className="shadow-card mb-6">
        <div className="px-4 pt-4 text-sm font-medium">
          {run.status === "draft" ? "2. People and amounts" : "People and payment results"}
        </div>
        <CardContent className="p-0 divide-y divide-border/60">
          {lines.map((line: PayrollLine) => (
            <div key={line.id} className="p-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="font-medium">{line.personName || "Payee"}</p>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <PayrollRailBadge rail={line.rail} />
                  <PayrollLineStatusBadge status={line.status} />
                </div>
                {line.errorMessage ? (
                  <p className="mt-1 text-xs text-destructive">{line.errorMessage}</p>
                ) : null}
              </div>
              <div className="flex items-center gap-3">
                {editable && canPrepare ? (
                  <Input
                    className="w-32 tabular-nums"
                    defaultValue={String(line.amount)}
                    onChange={(e) =>
                      setAmountEdits((prev) => ({ ...prev, [line.id]: e.target.value }))
                    }
                  />
                ) : (
                  <span className="text-sm font-medium tabular-nums">
                    {formatCurrency(line.amount, line.payCurrency)}
                  </span>
                )}
                {line.payrollDocumentId ? (
                  <>
                    <Button variant="outline" size="sm" onClick={() => void downloadPayStub(line.payrollDocumentId!)}>
                      Download pay stub
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => void resendPayStub(line.payrollDocumentId!)}>
                      Resend email
                    </Button>
                    {line.documentDeliveryStatus ? (
                      <span className="text-xs capitalize text-muted-foreground">
                        Email {line.documentDeliveryStatus}
                      </span>
                    ) : null}
                  </>
                ) : null}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card className="shadow-soft mb-6">
        <CardContent className="p-4 text-sm space-y-2">
          <p>
            <span className="text-muted-foreground">Scheduled for:</span>{" "}
            {run.scheduledFor ? formatDate(run.scheduledFor) : "—"}
          </p>
          {run.approvedAt ? (
            <p>
              <span className="text-muted-foreground">Approved:</span> {formatDate(run.approvedAt)}
            </p>
          ) : null}
          {run.executedAt ? (
            <p>
              <span className="text-muted-foreground">Executed:</span> {formatDate(run.executedAt)}
            </p>
          ) : null}
        </CardContent>
      </Card>

      <PayrollLegalNote />

      {user?.id ? (
        <PinChallengeDialog
          open={confirmWithPin.open}
          onOpenChange={confirmWithPin.onOpenChange}
          userId={user.id}
          onVerified={confirmWithPin.onVerified}
        />
      ) : null}
    </div>
  )
}
