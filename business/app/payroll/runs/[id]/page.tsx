"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { useParams, useRouter, useSearchParams } from "next/navigation"
import {
  ArrowLeft,
  CalendarX2,
  MoreHorizontal,
  Pencil,
  Trash2,
  Undo2,
  XCircle,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { PayrollLegalNote } from "@/components/payroll/payroll-legal-note"
import { PayrollPageHeader } from "@/components/payroll/payroll-page-header"
import { PayrollLineStatusBadge, PayrollRunStatusBadge } from "@/components/payroll/payroll-run-status-badge"
import { PayrollRailBadge } from "@/components/payroll/payroll-rail-badge"
import { PayrollDeleteDialog } from "@/components/payroll/payroll-delete-dialog"
import { usePayrollCapabilities, usePayrollRunDetail } from "@/hooks/queries/use-payroll"
import {
  useSubmitPayrollRun,
  useApprovePayrollRun,
  useExecutePayrollRun,
  useRetryPayrollRun,
  useWithdrawPayrollRun,
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

export default function PayrollRunDetailPage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const searchParams = useSearchParams()
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
  const deleteRun = useDeletePayrollRun()
  const { user } = useAuth()
  const confirmWithPin = useConfirmWithPin()
  const autoActionStarted = useRef(false)
  const [deleteOpen, setDeleteOpen] = useState(false)

  const run = runQuery.data
  const lines = useMemo(() => run?.lines ?? [], [run?.lines])
  const failedLines = lines.filter((l) => l.status === "failed")
  const hasPayStubs = lines.some((line) => Boolean(line.payrollDocumentId))
  const awaitingApproval = run?.status === "pending_approval" || run?.status === "needs_reapproval"
  const futurePayday = Boolean(
    run?.payday
      && new Date(`${run.payday.slice(0, 10)}T23:59:59`).getTime() > Date.now(),
  )
  const canApproveDraftDirectly = Boolean(
    run?.status === "draft"
      && canApprove
      && !capabilities?.requireSeparateApprover,
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
    const reason = window.prompt("Why are you returning this payroll to draft?")
    if (!reason?.trim()) return
    try {
      await apiFetch(`/api/business/payroll/runs/${runId}`, { method: "POST", body: { action: "reject", reason } })
      toast.success("Payroll returned to draft")
      await runQuery.refetch()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Payroll could not be rejected")
    }
  }

  async function cancelSchedule() {
    try {
      await apiFetch(`/api/business/payroll/runs/${runId}`, { method: "POST", body: { action: "cancel" } })
      toast.success("Scheduled payroll cancelled")
      await runQuery.refetch()
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

  if (runQuery.isLoading) {
    return <div className="mx-auto max-w-6xl px-4 py-8 text-sm text-muted-foreground">Loading run…</div>
  }

  if (!run) {
    return <div className="mx-auto max-w-6xl px-4 py-8 text-sm text-muted-foreground">Run not found.</div>
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <Button variant="ghost" size="sm" className="mb-4" asChild>
        <Link href="/payroll/runs"><ArrowLeft className="mr-2 h-4 w-4" />Back to Runs</Link>
      </Button>
      <PayrollPageHeader
        title={String(run.metadata?.name || "Payroll run")}
        description={run.payPeriodStart && run.payPeriodEnd
          ? `${formatDate(run.payPeriodStart)} – ${formatDate(run.payPeriodEnd)}`
          : "Payroll payment details and results."}
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
                <Link href={`/payroll/runs/${runId}/edit`}>
                  <Pencil className="mr-2 h-4 w-4" />Edit
                </Link>
              </Button>
            ) : null}
            {(run.status === "approved" || run.status === "partial") && canApprove ? (
              <Button variant="primary" onClick={() => void handleExecute()} disabled={executeRun.isPending}>
                Execute with PIN
              </Button>
            ) : null}
            {failedLines.length > 0 && canApprove ? (
              <Button
                variant={run.status === "failed" ? "primary" : "outline"}
                onClick={() =>
                  retryRun.mutate(
                    failedLines.map((line) => line.id),
                    {
                      onSuccess: (result) => toast.success(`Retried ${result.retried.length} payments`),
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
            {(awaitingApproval || canApproveDraftDirectly) && canApprove ? (
              <Button
                variant="primary"
                onClick={() => void (futurePayday ? handleApproveAndSchedule() : handleApproveAndPay())}
                disabled={approveRun.isPending || executeRun.isPending}
              >
                {futurePayday ? "Approve and schedule" : "Approve and pay"}
              </Button>
            ) : null}
            {(
              (run.status === "draft" && canPrepare)
              || (run.status === "failed" && canPrepare)
              || (awaitingApproval && (canPrepare || canApprove))
              || (run.status === "scheduled" && canApprove)
            ) ? (
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
                      onClick={() => withdrawRun.mutate(undefined, {
                        onSuccess: () => toast.success("Run returned to draft"),
                        onError: (error) => toast.error(error.message),
                      })}
                    >
                      <Undo2 />Withdraw to draft
                    </DropdownMenuItem>
                  ) : null}
                  {awaitingApproval && canApprove ? (
                    <DropdownMenuItem onClick={() => void rejectRun()}>
                      <XCircle />Reject
                    </DropdownMenuItem>
                  ) : null}
                  {run.status === "scheduled" && canApprove ? (
                    <DropdownMenuItem onClick={() => void cancelSchedule()}>
                      <CalendarX2 />Cancel schedule
                    </DropdownMenuItem>
                  ) : null}
                  {(run.status === "draft" || run.status === "failed") && canPrepare ? (
                    <DropdownMenuItem variant="destructive" onClick={() => setDeleteOpen(true)}>
                      <Trash2 />{run.status === "failed" ? "Delete failed run" : "Delete draft"}
                    </DropdownMenuItem>
                  ) : null}
                </DropdownMenuContent>
              </DropdownMenu>
            ) : null}
          </div>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-6">
      {run.shortfall > 0 ? (
        <Card className="shadow-soft border-amber-200/60">
          <CardContent className="p-4 text-sm text-amber-800 dark:text-amber-300">
            Need {formatCurrency(run.shortfall, run.sourceCurrency)} more in {run.sourceCurrency} before
            execute.
          </CardContent>
        </Card>
      ) : null}

        <Card className="shadow-soft">
          <CardContent className="p-5">
            <p className="mb-4 text-sm font-medium">Payroll details</p>
            <div className="grid gap-4 text-sm sm:grid-cols-3">
              <Detail label="Pay period start" value={run.payPeriodStart ? formatDate(run.payPeriodStart) : "—"} />
              <Detail label="Pay period end" value={run.payPeriodEnd ? formatDate(run.payPeriodEnd) : "—"} />
              <Detail label="Payday" value={run.payday ? formatDate(run.payday) : "—"} />
            </div>
          </CardContent>
        </Card>

      <Card className="shadow-card">
        <div className="px-4 pt-4 text-sm font-medium">
          {run.status === "draft" ? "People and amounts" : "People and payment results"}
        </div>
        <CardContent className="p-0 divide-y divide-border/60">
          {lines.map((line: PayrollLine) => (
            <div key={line.id} className="p-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="font-medium">{line.personName || "Person"}</p>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <PayrollRailBadge rail={line.rail} />
                  <PayrollLineStatusBadge status={line.status} />
                </div>
                {line.errorMessage ? (
                  <p className="mt-1 text-xs text-destructive">{line.errorMessage}</p>
                ) : null}
              </div>
              <div className="flex items-center gap-3">
                <span className="text-sm font-medium tabular-nums">
                  {formatCurrency(line.amount, line.payCurrency)}
                </span>
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

      {run.approvalSnapshot ? (
        <Card className="shadow-soft">
          <CardContent className="p-5">
            <h2 className="text-sm font-medium">Approved payroll details</h2>
            <div className="mt-4 grid gap-4 text-sm sm:grid-cols-3">
              <p><span className="block text-xs text-muted-foreground">Approved debit</span>{formatCurrency(run.approvalSnapshot.approvedDebit, run.approvalSnapshot.sourceCurrency)}</p>
              <p><span className="block text-xs text-muted-foreground">People</span>{run.approvalSnapshot.people.length}</p>
              <p><span className="block text-xs text-muted-foreground">Approved</span>{run.approvedAt ? formatDate(run.approvedAt) : "—"}</p>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <Card className="shadow-soft">
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

      <Card className="shadow-soft">
        <CardContent className="p-5">
          <h2 className="text-sm font-medium">Activity</h2>
          <ol className="mt-4 space-y-4">
            {(run.events ?? []).length ? run.events?.map((event) => (
              <li key={event.id} className="relative border-l pl-4">
                <span className="absolute -left-1 top-1 h-2 w-2 rounded-full bg-primary" />
                <p className="text-sm">{event.eventType.replaceAll(".", " ").replace(/\b\w/g, (c) => c.toUpperCase())}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">{formatDate(event.createdAt)}</p>
              </li>
            )) : <li className="text-sm text-muted-foreground">No activity recorded yet.</li>}
          </ol>
        </CardContent>
      </Card>
        </div>
        <div className="space-y-6">
          <Card className="h-fit shadow-soft lg:sticky lg:top-6">
            <CardContent className="p-5">
              <div className="flex items-center justify-between gap-3">
                <h2 className="font-semibold">Run summary</h2>
                <PayrollRunStatusBadge status={run.status} />
              </div>
              <dl className="mt-5 space-y-4 text-sm">
                <SummaryDetail label="Amount" value={formatCurrency(run.totalSource, run.sourceCurrency)} strong />
                <SummaryDetail label="People" value={String(lines.length)} />
                <SummaryDetail label="Receiving methods" value={railSummary || "—"} />
                <SummaryDetail label="Created" value={formatDate(run.createdAt)} />
              </dl>
            </CardContent>
          </Card>
          <PayrollLegalNote />
        </div>
      </div>

      <PayrollDeleteDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title={run.status === "failed" ? "Delete this failed payroll run?" : "Delete this payroll draft?"}
        description={run.status === "failed"
          ? "This permanently removes the failed run and its unsuccessful payment lines. No completed payment history will be deleted."
          : "This permanently removes the draft and its unsent payment lines. Submitted or completed payroll history cannot be deleted."}
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

function SummaryDetail({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={strong ? "text-right font-semibold tabular-nums" : "text-right"}>{value}</dd>
    </div>
  )
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <p>
      <span className="block text-xs text-muted-foreground">{label}</span>
      <span className="mt-1 block">{value}</span>
    </p>
  )
}
