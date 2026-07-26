"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { useParams, useRouter, useSearchParams } from "next/navigation"
import { CalendarX2, MoreHorizontal, Pencil, Trash2, Undo2, XCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Textarea } from "@/components/ui/textarea"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { PayrollLegalNote } from "@/components/payroll/payroll-legal-note"
import { PayrollSubpageShell } from "@/components/payroll/payroll-subpage-shell"
import { PayrollLineStatusBadge, PayrollRunStatusBadge } from "@/components/payroll/payroll-run-status-badge"
import { PayrollRailBadge } from "@/components/payroll/payroll-rail-badge"
import { PayrollDeleteDialog } from "@/components/payroll/payroll-delete-dialog"
import { PayrollDetailSkeleton, PayrollInlineRefreshing } from "@/components/payroll/payroll-page-skeleton"
import {
  usePayrollCapabilities,
  usePayrollRunDetail,
  usePayrollTimingPreview,
} from "@/hooks/queries/use-payroll"
import {
  useSubmitPayrollRun,
  useApprovePayrollRun,
  useExecutePayrollRun,
  useRetryPayrollRun,
  useWithdrawPayrollRun,
  useRejectPayrollRun,
  useCancelPayrollRun,
  useDeletePayrollRun,
} from "@/hooks/mutations/use-payroll"
import { useConfirmWithPin } from "@/components/app-lock/use-confirm-with-pin"
import { PinChallengeDialog } from "@/components/app-lock/pin-challenge-dialog"
import { useAuth } from "@/lib/auth-context"
import { formatCurrency, formatDate } from "@/lib/utils"
import { toast } from "sonner"
import type { PayrollLine } from "@/lib/payroll/types"
import { apiFetch } from "@/lib/query/api-client"
import { railLabel } from "@/lib/payroll/helpers"
import { safePayrollReturnTo } from "@/lib/payroll/navigation"
import { formatPayrollZonedDateTime } from "@/lib/payroll/schedule-preview"

export default function PayrollRunDetailPage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const searchParams = useSearchParams()
  const returnTo = safePayrollReturnTo(searchParams.get("returnTo"), "/payroll/runs")
  const runId = params.id
  const runQuery = usePayrollRunDetail(runId)
  const capabilities = usePayrollCapabilities().data
  const canPrepare = Boolean(capabilities?.canPrepare)
  const canApprove = Boolean(capabilities?.canApprove)
  const submitRun = useSubmitPayrollRun(runId)
  const approveRun = useApprovePayrollRun(runId)
  const executeRun = useExecutePayrollRun(runId)
  const retryRun = useRetryPayrollRun(runId)
  const withdrawRun = useWithdrawPayrollRun(runId)
  const rejectRunMutation = useRejectPayrollRun(runId)
  const cancelRunMutation = useCancelPayrollRun(runId)
  const deleteRun = useDeletePayrollRun()
  const { user } = useAuth()
  const confirmWithPin = useConfirmWithPin()
  const autoActionStarted = useRef(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [rejectOpen, setRejectOpen] = useState(false)
  const [rejectReason, setRejectReason] = useState("")

  const run = runQuery.data
  const timingPreview = usePayrollTimingPreview(
    run && !run.approvalSnapshot?.executionSchedule ? run.payday : null,
  )
  const executionSchedule = run?.approvalSnapshot?.executionSchedule
  const previewSchedulesForLater = Boolean(
    timingPreview.data?.scheduledAt &&
      new Date(timingPreview.data.scheduledAt).getTime() > Date.now(),
  )
  const scheduledPaymentDisplay = executionSchedule
    ? formatPayrollZonedDateTime(
        executionSchedule.scheduledAt,
        executionSchedule.timezone,
      ) ?? `${executionSchedule.payday} ${executionSchedule.localTime} (${executionSchedule.timezone})`
    : run?.scheduledAt
      ? formatPayrollZonedDateTime(run.scheduledAt, "UTC") ?? run.scheduledAt
      : previewSchedulesForLater
        ? timingPreview.data?.display ?? null
        : "Immediately after approval"
  const scheduledExecutionUtc =
    executionSchedule?.scheduledAt ??
    run?.scheduledAt ??
    (previewSchedulesForLater ? timingPreview.data?.scheduledAt : null) ??
    null
  const executionJob = run?.metadata?.executionJob as
    | {
        status?: string
        phase?: string
        processedLines?: number
        totalLines?: number
        errorCode?: string | null
      }
    | undefined
  const lines = useMemo(() => run?.lines ?? [], [run?.lines])
  const failedLines = lines.filter((l) => l.status === "failed")
  const paymentResultsVisible = Boolean(
    run && ["executing", "completed", "partial", "failed"].includes(run.status),
  )
  const hasPayStubs = lines.some((line) => Boolean(line.payrollDocumentId))
  const awaitingApproval = run?.status === "pending_approval" || run?.status === "needs_reapproval"
  const futurePayday = Boolean(
    timingPreview.data?.scheduledAt
      ? new Date(timingPreview.data.scheduledAt).getTime() > Date.now()
      : run?.payday && run.payday.slice(0, 10) > new Date().toISOString().slice(0, 10),
  )
  const canApproveDraftDirectly = Boolean(
    run?.status === "draft" && canApprove && capabilities?.canSelfApprove,
  )
  const selfApprovalBlocked = Boolean(
    awaitingApproval &&
    canApprove &&
    !capabilities?.canSelfApprove &&
    run?.submittedBy &&
    run.submittedBy === user?.id,
  )

  const railSummary = useMemo(() => {
    const mix: Record<string, number> = {}
    for (const line of lines) {
      mix[line.rail] = (mix[line.rail] ?? 0) + 1
    }
    return Object.entries(mix)
      .map(([rail, n]) => `${n} ${railLabel(rail as PayrollLine["rail"])}`)
      .join(" · ")
  }, [lines])

  async function handleExecute() {
    if (!(await confirmWithPin.requestConfirm())) return
    try {
      await executeRun.mutateAsync()
      toast.success("Payroll queued for sending")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Execute failed")
    }
  }

  async function handleApproveAndPay() {
    if (!(await confirmWithPin.requestConfirm())) return
    try {
      await approveRun.mutateAsync({ mode: "pay_now" })
      await executeRun.mutateAsync()
      toast.success("Payroll approved and queued")
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
      await approveRun.mutateAsync({ mode: "schedule" })
      toast.success("Payroll approved and scheduled")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Payroll could not be scheduled")
    }
  }

  useEffect(() => {
    const action = searchParams.get("action")
    if (autoActionStarted.current || !run || !canApprove || !awaitingApproval) return
    if (action !== "pay" && action !== "schedule") return
    autoActionStarted.current = true
    if (action === "pay") void handleApproveAndPay()
    else void handleApproveAndSchedule()
    // The action is intentionally consumed once after the newly-created run loads.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [awaitingApproval, canApprove, run, searchParams])

  async function rejectRun() {
    const reason = rejectReason.trim()
    if (!reason || rejectRunMutation.isPending) return
    try {
      await rejectRunMutation.mutateAsync(reason)
      toast.success("Payroll returned to draft")
      setRejectOpen(false)
      setRejectReason("")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Payroll could not be rejected")
    }
  }

  async function cancelSchedule() {
    try {
      await cancelRunMutation.mutateAsync()
      toast.success("Scheduled payroll cancelled")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Schedule could not be cancelled")
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

  if (runQuery.isPending && !run) {
    return <PayrollDetailSkeleton />
  }

  if (!run) {
    return <div className="mx-auto max-w-6xl px-4 py-8 text-sm text-muted-foreground">Run not found.</div>
  }

  return (
    <PayrollSubpageShell
        backHref={returnTo}
        backLabel="Back to Runs"
        section="Runs"
        current={String(run.metadata?.name || "Payroll run")}
        title={String(run.metadata?.name || "Payroll run")}
        description={
          run.payPeriodStart && run.payPeriodEnd
            ? `${formatDate(run.payPeriodStart)} – ${formatDate(run.payPeriodEnd)}`
            : "Payroll payment details and results."
        }
        status={<PayrollRunStatusBadge status={run.status} />}
        actions={
          <div className="flex shrink-0 items-center gap-2 overflow-x-auto">
            {hasPayStubs ? (
              <Button variant="outline" asChild>
                <a href={`/api/business/payroll/runs/${runId}/documents/export`} download>
                  Download pay stubs
                </a>
              </Button>
            ) : null}
            {run.status === "draft" && canPrepare ? (
              <Button variant="outline" asChild>
                <Link href={`/payroll/runs/new?edit=${encodeURIComponent(runId)}`}>
                  <Pencil className="mr-2 h-4 w-4" />
                  Edit
                </Link>
              </Button>
            ) : null}
            {(run.status === "approved" ||
              run.status === "partial" ||
              (run.status === "executing" && executionJob?.status === "dead_letter")) &&
            canApprove ? (
              <Button variant="primary" onClick={() => void handleExecute()} disabled={executeRun.isPending}>
                {executionJob?.status === "dead_letter" ? "Retry sending" : "Execute with PIN"}
              </Button>
            ) : null}
            {failedLines.length > 0 && canApprove ? (
              <Button
                variant={run.status === "failed" ? "primary" : "outline"}
                onClick={() =>
                  retryRun.mutate(
                    failedLines.map((line) => line.id),
                    {
                      onSuccess: (result) =>
                        toast.success(
                          `${result.retried.length} failed ${result.retried.length === 1 ? "payment" : "payments"} queued`,
                        ),
                      onError: (error) => toast.error(error.message),
                    },
                  )
                }
                disabled={retryRun.isPending}
              >
                Retry failed
              </Button>
            ) : null}
            {run.status === "draft" && canPrepare && !canApproveDraftDirectly ? (
              <Button
                variant="primary"
                onClick={() =>
                  submitRun.mutate(undefined, {
                    onSuccess: () => toast.success("Submitted for approval"),
                    onError: (error) => toast.error(error.message),
                  })
                }
                disabled={submitRun.isPending}
              >
                Submit for approval
              </Button>
            ) : null}
            {(awaitingApproval || canApproveDraftDirectly) && canApprove && !selfApprovalBlocked ? (
              <Button
                variant="primary"
                onClick={() => void (futurePayday ? handleApproveAndSchedule() : handleApproveAndPay())}
                disabled={
                  approveRun.isPending ||
                  executeRun.isPending ||
                  (Boolean(run.payday) && timingPreview.isPending)
                }
              >
                {futurePayday ? "Approve and schedule" : "Approve and pay"}
              </Button>
            ) : null}
            {(run.status === "draft" && canPrepare) ||
            (run.status === "failed" && canPrepare) ||
            (awaitingApproval && (canPrepare || canApprove)) ||
            (run.status === "scheduled" && canApprove) ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    size="icon"
                    aria-label={`More actions for ${String(run.metadata?.name || "payroll run")}`}
                  >
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {awaitingApproval && canPrepare ? (
                    <DropdownMenuItem
                      disabled={withdrawRun.isPending}
                      onClick={() =>
                        withdrawRun.mutate(undefined, {
                          onSuccess: () => toast.success("Run returned to draft"),
                          onError: (error) => toast.error(error.message),
                        })
                      }
                    >
                      <Undo2 />
                      Withdraw to draft
                    </DropdownMenuItem>
                  ) : null}
                  {awaitingApproval && canApprove ? (
                    <DropdownMenuItem onClick={() => setRejectOpen(true)}>
                      <XCircle />
                      Reject
                    </DropdownMenuItem>
                  ) : null}
                  {run.status === "scheduled" && canApprove ? (
                    <DropdownMenuItem onClick={() => void cancelSchedule()}>
                      <CalendarX2 />
                      Cancel scheduled payment
                    </DropdownMenuItem>
                  ) : null}
                  {(run.status === "draft" || run.status === "failed") && canPrepare ? (
                    <DropdownMenuItem variant="destructive" onClick={() => setDeleteOpen(true)}>
                      <Trash2 />
                      {run.status === "failed" ? "Delete failed run" : "Delete draft"}
                    </DropdownMenuItem>
                  ) : null}
                </DropdownMenuContent>
              </DropdownMenu>
            ) : null}
          </div>
        }
      >
      {["queued", "processing", "retry"].includes(String(executionJob?.status || "")) ? (
        <div className="mb-6 rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-950 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-100">
          <p className="font-medium">
            {executionJob?.phase === "reconciling"
              ? "Confirming payroll payments"
              : executionJob?.phase === "funding"
                ? "Payroll is waiting for funding"
                : executionJob?.phase === "quoting"
                  ? "Preparing payroll payment quotes"
                : executionJob?.status === "processing"
                  ? "Sending payroll payments"
              : executionJob?.status === "retry"
                ? "Payroll is waiting to retry"
                : "Payroll is queued for sending"}
          </p>
          <p className="mt-1 opacity-80">
            {Number(executionJob?.totalLines || 0) > 0
              ? `${Number(executionJob?.processedLines || 0)} of ${Number(executionJob?.totalLines || 0)} payments processed. `
              : ""}
            This page updates automatically.
          </p>
        </div>
      ) : null}

      {selfApprovalBlocked ? (
        <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100">
          This run is waiting for another delegated Payroll approver. A business owner or admin can also approve it.
        </div>
      ) : null}

      <Card className="shadow-card">
        <CardContent className="p-0">
          <section className="p-5 sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-semibold">Run details</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Pay period, payday, amount, and payment setup.
                </p>
              </div>
            </div>
            <dl className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
              <Detail label="Run type" value={run.metadata?.offCycle ? "Off-cycle" : "Regular"} />
              <Detail
                label="Schedule"
                value={run.scheduleId ? String(run.metadata?.scheduleName || "Linked schedule") : "No schedule"}
              />
              <Detail
                label="Pay period"
                value={
                  run.payPeriodStart && run.payPeriodEnd
                    ? `${formatDate(run.payPeriodStart)} – ${formatDate(run.payPeriodEnd)}`
                    : "—"
                }
              />
              <Detail label="Payday" value={run.payday ? formatDate(run.payday) : "—"} />
              <Detail
                label="Payment time"
                value={scheduledPaymentDisplay ?? "Calculated when approved"}
              />
              {scheduledExecutionUtc ? (
                <Detail label="UTC execution" value={scheduledExecutionUtc} />
              ) : null}
              <Detail label="Amount" value={formatCurrency(run.totalSource, run.sourceCurrency)} />
              <Detail label="People" value={String(lines.length)} />
              <Detail label="Source account" value={`${run.sourceCurrency} account`} />
              <Detail label="Receiving methods" value={railSummary || "—"} />
            </dl>
            {run.scheduleId ? (
              <p className="mt-5 rounded-xl border bg-muted/30 p-4 text-sm text-muted-foreground">
                This run is one occurrence of the linked schedule. Cancelling this occurrence does not pause
                future payroll drafts; manage the recurring schedule from Schedules.
              </p>
            ) : null}
          </section>

          <section className="border-t p-5 sm:p-6">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 className="font-semibold">Funding</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  The source account must cover the payroll amount before payments are sent.
                </p>
              </div>
              <span
                className={
                  run.shortfall > 0
                    ? "rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-800 dark:bg-amber-950 dark:text-amber-200"
                    : "rounded-full bg-emerald-100 px-3 py-1 text-xs font-medium text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200"
                }
              >
                {run.shortfall > 0 ? "Funding needed" : "Funded"}
              </span>
            </div>
            <dl className="mt-5 grid gap-5 sm:grid-cols-3">
              <Detail label="Payroll amount" value={formatCurrency(run.totalSource, run.sourceCurrency)} />
              <Detail
                label="Amount to fund"
                value={formatCurrency(Math.max(0, run.shortfall), run.sourceCurrency)}
              />
              <Detail
                label={run.status === "scheduled" ? "Scheduled for" : "Payment date"}
                value={
                  run.status === "scheduled" && run.scheduledAt
                    ? scheduledPaymentDisplay ?? formatDate(run.scheduledAt)
                    : run.payday
                      ? formatDate(run.payday)
                      : "—"
                }
              />
            </dl>
            {run.shortfall > 0 ? (
              <div className="mt-5 flex flex-col gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950 sm:flex-row sm:items-center sm:justify-between dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100">
                <span>
                  Add {formatCurrency(run.shortfall, run.sourceCurrency)} before payday so these payments can be sent.
                </span>
                <Button variant="outline" size="sm" asChild>
                  <Link href="/accounts">View accounts</Link>
                </Button>
              </div>
            ) : null}
          </section>

          <section className="border-t">
            <div className="flex flex-wrap items-end justify-between gap-3 p-5 sm:p-6">
              <div>
                <h2 className="font-semibold">
                  {paymentResultsVisible ? "Payment results" : "People and amounts"}
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  {lines.length} {lines.length === 1 ? "person" : "people"} included in this payroll.
                </p>
              </div>
            </div>
            <div className="border-t">
              {lines.map((line: PayrollLine) => (
                <div
                  key={line.id}
                  className="grid gap-3 border-b px-5 py-4 last:border-b-0 sm:px-6 md:grid-cols-[minmax(0,1fr)_150px_140px_auto] md:items-center"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium">{line.personName || "Person"}</p>
                    <div className="mt-1">
                      <PayrollRailBadge rail={line.rail} />
                    </div>
                    {line.errorMessage ? (
                      <p className="mt-2 text-xs text-destructive">{line.errorMessage}</p>
                    ) : null}
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground md:hidden">Amount</p>
                    <p className="mt-1 text-sm font-medium tabular-nums md:mt-0">
                      {formatCurrency(line.amount, line.payCurrency)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground md:hidden">Status</p>
                    <div className="mt-1 md:mt-0">
                      <PayrollLineStatusBadge
                        status={line.status}
                        label={payrollLineStatusLabel(line.status, run.status)}
                      />
                    </div>
                    {line.settledAt ? (
                      <p className="mt-1 text-xs text-muted-foreground">
                        {formatPayrollZonedDateTime(
                          line.settledAt,
                          executionSchedule?.timezone || "UTC",
                        ) ?? formatDate(line.settledAt)}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap items-center gap-2 md:justify-end">
                    {line.payrollDocumentId ? (
                      <>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => void downloadPayStub(line.payrollDocumentId!)}
                        >
                          Pay stub
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => void resendPayStub(line.payrollDocumentId!)}
                        >
                          Resend
                        </Button>
                      </>
                    ) : (
                      <span className="text-xs text-muted-foreground">
                        {line.status === "paid" ? "Preparing pay stub" : "No pay stub yet"}
                      </span>
                    )}
                    {line.documentDeliveryStatus ? (
                      <span className="w-full text-xs capitalize text-muted-foreground md:text-right">
                        Email {line.documentDeliveryStatus}
                      </span>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          </section>

          {run.approvalSnapshot ? (
            <section className="border-t p-5 sm:p-6">
              <h2 className="font-semibold">Approved payroll details</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                The payment details recorded when this payroll was approved.
              </p>
              <dl className="mt-5 grid gap-5 sm:grid-cols-3">
                <Detail
                  label="Approved amount"
                  value={formatCurrency(
                    run.approvalSnapshot.approvedDebit,
                    run.approvalSnapshot.sourceCurrency,
                  )}
                />
                <Detail label="People" value={String(run.approvalSnapshot.people.length)} />
                <Detail label="Approved" value={run.approvedAt ? formatDate(run.approvedAt) : "—"} />
                {run.approvalSnapshot.executionSchedule ? (
                  <>
                    <Detail
                      label="Scheduled payment"
                      value={scheduledPaymentDisplay ?? "—"}
                    />
                    <Detail
                      label="UTC execution"
                      value={run.approvalSnapshot.executionSchedule.scheduledAt}
                    />
                  </>
                ) : null}
              </dl>
            </section>
          ) : null}

        </CardContent>
      </Card>
      <div className="mt-6">
        <PayrollLegalNote />
      </div>

      <PayrollDeleteDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title={run.status === "failed" ? "Delete this failed payroll run?" : "Delete this payroll draft?"}
        description={
          run.status === "failed"
            ? "This permanently removes the failed run and its unsuccessful payment lines. No completed payment history will be deleted."
            : "This permanently removes the draft and its unsent payment lines. Submitted or completed payroll history cannot be deleted."
        }
        label={run.status === "failed" ? "Delete failed run" : "Delete draft"}
        pending={deleteRun.isPending}
        onDelete={async () => {
          try {
            await deleteRun.mutateAsync(runId)
            toast.success(run.status === "failed" ? "Failed payroll run deleted" : "Payroll draft deleted")
            router.push("/payroll/runs")
          } catch (error) {
            toast.error(error instanceof Error ? error.message : "Payroll run could not be deleted")
            throw error
          }
        }}
      />
      <Dialog
        open={rejectOpen}
        onOpenChange={(open) => {
          if (rejectRunMutation.isPending) return
          setRejectOpen(open)
          if (!open) setRejectReason("")
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject this payroll run?</DialogTitle>
            <DialogDescription>
              The run will return to draft so its details can be changed and submitted again.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="payroll-rejection-reason">
              Reason
            </label>
            <Textarea
              id="payroll-rejection-reason"
              value={rejectReason}
              onChange={(event) => setRejectReason(event.target.value)}
              placeholder="Explain what needs to be changed"
              rows={4}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectOpen(false)} disabled={rejectRunMutation.isPending}>
              Keep pending
            </Button>
            <Button
              variant="primary"
              onClick={() => void rejectRun()}
              disabled={!rejectReason.trim() || rejectRunMutation.isPending}
            >
              {rejectRunMutation.isPending ? "Rejecting…" : "Reject and return to draft"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <PayrollInlineRefreshing visible={runQuery.isFetching && !runQuery.isPending} />

      {user?.id ? (
        <PinChallengeDialog
          open={confirmWithPin.open}
          onOpenChange={confirmWithPin.onOpenChange}
          userId={user.id}
          onVerified={confirmWithPin.onVerified}
        />
      ) : null}
    </PayrollSubpageShell>
  )
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-1 text-sm">{value}</dd>
    </div>
  )
}

function payrollLineStatusLabel(
  status: PayrollLine["status"],
  runStatus: string,
): string | undefined {
  if (status === "pending") {
    if (runStatus === "scheduled") return "Scheduled"
    if (runStatus === "pending_approval" || runStatus === "needs_reapproval") return "Ready"
    if (runStatus === "draft" || runStatus === "approved") return "Not sent"
  }
  if (status === "quoting") return "Checking payment details"
  if (status === "locked") return "Ready to send"
  return undefined
}
