import { Badge } from "@/components/ui/badge"
import type { PayrollPerson } from "@/lib/payroll/types"

const copy: Record<string, string> = {
  ready: "Ready",
  pending: "Awaiting approval",
  pending_consent: "Awaiting approval",
  declined: "Declined",
  expired: "Expired",
  revoked: "Revoked",
  method_verification_required: "Needs attention",
  active: "Active",
  held: "On hold",
  terminated: "Inactive",
  manual: "Manual",
  approved: "Connected",
}

export function PayrollStatusBadge({ status }: { status: string }) {
  const positive = status === "ready" || status === "active" || status === "approved"
  const warning = status === "pending" || status === "pending_consent" || status === "held"
  return (
    <Badge
      variant="outline"
      className={
        positive
          ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300"
          : warning
            ? "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300"
            : ""
      }
    >
      {copy[status] ?? status.replaceAll("_", " ")}
    </Badge>
  )
}

export function personReadinessLabel(person: PayrollPerson) {
  if (person.status !== "active") return copy[person.status] ?? "Inactive"
  return copy[person.readinessStatus] ?? "Needs attention"
}
