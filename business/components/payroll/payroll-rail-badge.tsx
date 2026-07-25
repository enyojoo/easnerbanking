import { Badge } from "@/components/ui/badge"
import { railLabel } from "@/lib/payroll/helpers"
import type { PayrollRail } from "@/lib/payroll/types"

export function PayrollRailBadge({ rail }: { rail: PayrollRail }) {
  const variant = rail === "easetag" ? "emerald" : rail === "mobile" ? "amber" : "slate"
  return <Badge variant={variant}>{railLabel(rail)}</Badge>
}
