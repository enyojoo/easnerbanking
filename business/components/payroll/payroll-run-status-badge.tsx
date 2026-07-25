import { Badge } from "@/components/ui/badge"
import type { PayrollRunStatus, PayrollLineStatus } from "@/lib/payroll/types"

const runVariant: Record<PayrollRunStatus, "neutral" | "amber" | "emerald" | "oxblood" | "slate"> = {
  draft: "neutral",
  pending_approval: "amber",
  approved: "amber",
  scheduled: "amber",
  executing: "amber",
  completed: "emerald",
  partial: "amber",
  failed: "oxblood",
  needs_reapproval: "oxblood",
  cancelled: "slate",
}

const lineVariant: Record<PayrollLineStatus, "neutral" | "amber" | "emerald" | "oxblood" | "slate"> = {
  pending: "neutral",
  quoting: "amber",
  locked: "amber",
  paid: "emerald",
  failed: "oxblood",
  skipped: "slate",
}

function labelStatus(status: string) {
  return status.replace(/_/g, " ")
}

export function PayrollRunStatusBadge({ status }: { status: PayrollRunStatus }) {
  return <Badge variant={runVariant[status]}>{labelStatus(status)}</Badge>
}

export function PayrollLineStatusBadge({ status }: { status: PayrollLineStatus }) {
  return <Badge variant={lineVariant[status]}>{labelStatus(status)}</Badge>
}
