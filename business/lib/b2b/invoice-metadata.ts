import type { Invoice, InvoicePaymentInfo } from "@/lib/b2b/types"

/** Stored in `invoices.metadata` jsonb (plus top-level snapshot columns). */
export type InvoiceMetadata = {
  subtotal?: number
  discountRate?: number
  discount?: number
  tax?: number
  archived?: boolean
  memo?: string
  poNumber?: string
  paymentDisplay?: Invoice["paymentDisplay"]
  remindersSent?: Invoice["remindersSent"]
  emailsSent?: Invoice["emailsSent"]
  notes?: Invoice["notes"]
  statusHistory?: Invoice["statusHistory"]
  paymentInfo?: InvoicePaymentInfo
  finalizedDate?: string | null
  frequency?: string | null
}

export function parseInvoiceMetadata(raw: unknown): InvoiceMetadata {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {}
  return raw as InvoiceMetadata
}
