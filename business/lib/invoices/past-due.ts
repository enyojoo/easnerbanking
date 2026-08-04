import type { Invoice } from "@/lib/b2b/types"

const PAYABLE = new Set(["unpaid", "sent", "past_due"])

export function isInvoicePastDue(invoice: Pick<Invoice, "status" | "dueDate">): boolean {
  if (invoice.status === "past_due") return true
  if (!PAYABLE.has(invoice.status)) return false
  const due = invoice.dueDate?.slice(0, 10)
  if (!due) return false
  const today = new Date().toISOString().slice(0, 10)
  return due < today
}

export function shouldTransitionToPastDue(invoice: Pick<Invoice, "status" | "dueDate">): boolean {
  if (!PAYABLE.has(invoice.status)) return false
  const due = invoice.dueDate?.slice(0, 10)
  if (!due) return false
  const today = new Date().toISOString().slice(0, 10)
  return due < today
}
