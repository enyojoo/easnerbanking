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
import { usePayrollRunDetail } from "@/hooks/queries/use-payroll"
import {
  useUpdatePayrollRun,
  useSubmitPayrollRun,
  useApprovePayrollRun,
  useExecutePayrollRun,
  useRetryPayrollRun,
} from "@/hooks/mutations/use-payroll"
import { useConfirmWithPin } from "@/components/app-lock/use-confirm-with-pin"
import { PinChallengeDialog } from "@/components/app-lock/pin-challenge-dialog"
import { useAuth } from "@/lib/auth-context"
import { formatCurrency, formatDate } from "@/lib/utils"
import { toast } from "sonner"
import type { PayrollLine } from "@/lib/payroll/types"

export default function PayrollRunDetailPage() {
  const params = useParams<{ id: string }>()
  const runId = params.id
  const runQuery = usePayrollRunDetail(runId)
  const updateRun = useUpdatePayrollRun(runId)
  const submitRun = useSubmitPayrollRun(runId)
  const approveRun = useApprovePayrollRun(runId)
  const executeRun = useExecutePayrollRun(runId)
  const retryRun = useRetryPayrollRun(runId)
  const { user } = useAuth()
  const confirmWithPin = useConfirmWithPin()

  const run = runQuery.data
  const [amountEdits, setAmountEdits] = useState<Record<string, string>>({})

  const lines = useMemo(() => run?.lines ?? [], [run?.lines])
  const failedLines = lines.filter((l) => l.status === "failed")

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
    if (patchLines.length === 0) return
    try {
      await updateRun.mutateAsync({ lines: patchLines })
      toast.success("Amounts updated")
      setAmountEdits({})
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

  if (runQuery.isLoading) {
    return <div className="mx-auto max-w-6xl px-4 py-8 text-sm text-muted-foreground">Loading run…</div>
  }

  if (!run) {
    return <div className="mx-auto max-w-6xl px-4 py-8 text-sm text-muted-foreground">Run not found.</div>
  }

  const editable = run.status === "draft" || run.status === "pending_approval"

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
          {run.status === "draft" ? (
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
                disabled={submitRun.isPending}
              >
                Submit for approval
              </Button>
            </>
          ) : null}
          {run.status === "pending_approval" ? (
            <Button
              variant="primary"
              onClick={() =>
                approveRun.mutate(undefined, {
                  onSuccess: () => toast.success("Approved — FX locked"),
                  onError: (e) => toast.error(e.message),
                })
              }
              disabled={approveRun.isPending}
            >
              Approve run
            </Button>
          ) : null}
          {run.status === "approved" || run.status === "partial" ? (
            <Button variant="primary" onClick={() => void handleExecute()} disabled={executeRun.isPending}>
              Execute with PIN
            </Button>
          ) : null}
          {failedLines.length > 0 ? (
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

      <Card className="shadow-card mb-6">
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
                {editable ? (
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
