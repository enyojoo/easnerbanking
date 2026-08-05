import { Badge } from "@/components/ui/badge"
import { invoiceStatusLabel, type InvoiceStatus } from "@/lib/invoices/invoice-status"

const statusVariants: Record<
  InvoiceStatus,
  "neutral" | "emerald" | "amber" | "oxblood" | "slate" | "secondary"
> = {
  draft: "slate",
  unpaid: "amber",
  sent: "secondary",
  past_due: "oxblood",
  paid: "emerald",
  void: "neutral",
}

export function InvoiceStatusBadge({ status }: { status: string }) {
  if (status === "archived") {
    return <Badge variant="secondary">Archived</Badge>
  }
  const normalized = status as InvoiceStatus
  const label = invoiceStatusLabel(normalized)
  const variant = statusVariants[normalized] ?? "secondary"
  return <Badge variant={variant}>{label}</Badge>
}
