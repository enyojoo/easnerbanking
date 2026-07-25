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

export function payrollStatusLabel(status: string | null | undefined): string {
  const normalized = String(status || "").trim()
  if (!normalized) return "Needs attention"
  return copy[normalized] ?? normalized.replaceAll("_", " ")
}

export function PayrollStatusBadge({ status }: { status?: string | null }) {
  const normalized = String(status || "").trim()
  const positive = normalized === "ready" || normalized === "active" || normalized === "approved"
  const warning = normalized === "pending" || normalized === "pending_consent" || normalized === "held"
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
      {payrollStatusLabel(normalized)}
    </Badge>
  )
}

export function personReadinessLabel(person: PayrollPerson) {
  if (person.status !== "active") return payrollStatusLabel(person.status)
  return payrollStatusLabel(person.readinessStatus)
}
