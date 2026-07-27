import type {
  PayrollLineStatus,
  PayrollRun,
} from "./types"

export type PayrollRunAction =
  | "edit"
  | "duplicate"
  | "submit"
  | "approve"
  | "reject"
  | "return_to_draft"
  | "execute"
  | "cancel"
  | "retry"
  | "create_correction"
  | "delete"
  | "download_pay_stubs"
  | "view_progress"

export type PayrollRunLineStatusCounts = Record<PayrollLineStatus, number>

const EMPTY_COUNTS: PayrollRunLineStatusCounts = {
  pending: 0,
  quoting: 0,
  locked: 0,
  processing: 0,
  paid: 0,
  failed: 0,
  skipped: 0,
}

export function payrollRunLineStatusCounts(
  run: Pick<PayrollRun, "lines" | "lineStatusCounts">,
): PayrollRunLineStatusCounts {
  if (run.lineStatusCounts) return run.lineStatusCounts
  return (run.lines ?? []).reduce<PayrollRunLineStatusCounts>((counts, line) => {
    counts[line.status] += 1
    return counts
  }, { ...EMPTY_COUNTS })
}

export function getPayrollRunActions(input: {
  run: Pick<PayrollRun, "status" | "lines" | "lineStatusCounts">
  canPrepare: boolean
  canApprove: boolean
  canSelfApprove?: boolean
  hasPayStubs?: boolean
}): PayrollRunAction[] {
  const { run, canPrepare, canApprove } = input
  const counts = payrollRunLineStatusCounts(run)
  const actions: PayrollRunAction[] = []

  if (input.hasPayStubs) actions.push("download_pay_stubs")

  if (run.status === "draft") {
    if (canPrepare) actions.push("edit", "duplicate")
    if (canApprove && input.canSelfApprove !== false) actions.push("approve")
    else if (canPrepare) actions.push("submit")
    if (canPrepare) actions.push("delete")
    return actions
  }

  if (canPrepare) actions.push("duplicate")

  if (run.status === "pending_approval" || run.status === "needs_reapproval") {
    if (canApprove) actions.push("approve", "reject")
    if (canPrepare) actions.push("return_to_draft")
    return actions
  }

  if (run.status === "approved") {
    if (canApprove) actions.push("execute")
    return actions
  }

  if (run.status === "scheduled") {
    if (canApprove) actions.push("cancel")
    return actions
  }

  if (run.status === "cancelled") {
    if (canPrepare) actions.push("return_to_draft")
    return actions
  }

  if (run.status === "executing") {
    actions.push("view_progress")
    if (canApprove && counts.failed > 0) actions.push("retry")
    return actions
  }

  if (run.status === "failed") {
    const hasSuccessfulPayment = counts.paid > 0
    if (canApprove && counts.failed > 0) actions.push("retry")
    if (!hasSuccessfulPayment && counts.processing === 0 && canPrepare) {
      actions.push("edit", "delete")
    } else if (hasSuccessfulPayment && canPrepare) {
      actions.push("create_correction")
    }
    return actions
  }

  if (run.status === "partial") {
    if (canApprove && counts.failed > 0) actions.push("retry")
    if (canPrepare && counts.paid > 0 && counts.failed > 0) {
      actions.push("create_correction")
    }
    return actions
  }

  return actions
}
