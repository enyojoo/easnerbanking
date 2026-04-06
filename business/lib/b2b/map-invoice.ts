import type { Invoice, InvoiceLineItem } from "@/lib/b2b/types"
import { parseInvoiceMetadata, type InvoiceMetadata } from "@/lib/b2b/invoice-metadata"

export type B2bInvoiceRow = {
  id: string
  business_id: string
  customer_id: string | null
  invoice_number: string
  amount_cents: number | string | null
  currency: string | null
  status: string | null
  due_date: string | null
  line_items: unknown
  tax_rate: number | string | null
  bill_to_type: string | null
  customer_name: string | null
  customer_email: string | null
  customer_phone: string | null
  customer_company: string | null
  customer_address: string | null
  metadata: unknown
  created_at: string
  updated_at?: string
}

function centsToAmount(cents: number | string | null | undefined): number {
  const n = typeof cents === "string" ? Number(cents) : Number(cents ?? 0)
  if (!Number.isFinite(n)) return 0
  return n / 100
}

function parseLineItems(raw: unknown): InvoiceLineItem[] {
  if (!Array.isArray(raw)) return []
  return raw.filter(Boolean) as InvoiceLineItem[]
}

function normalizeStatus(s: string | null | undefined): Invoice["status"] {
  const v = (s ?? "draft").toLowerCase()
  const allowed: Invoice["status"][] = [
    "draft",
    "open",
    "sent",
    "past_due",
    "paid",
    "void",
    "uncollectible",
    "failed",
  ]
  if (allowed.includes(v as Invoice["status"])) return v as Invoice["status"]
  if (v === "pastdue" || v === "past-due") return "past_due"
  return "draft"
}

export function mapRowToInvoice(row: B2bInvoiceRow): Invoice {
  const meta = parseInvoiceMetadata(row.metadata)
  const lineItems = parseLineItems(row.line_items)
  const total = centsToAmount(row.amount_cents)
  const taxRate = Number(row.tax_rate ?? 0)
  const due = row.due_date ? String(row.due_date).slice(0, 10) : new Date().toISOString().slice(0, 10)
  const created = row.created_at ? String(row.created_at).slice(0, 10) : due

  const inv: Invoice = {
    id: row.id,
    invoiceNumber: row.invoice_number,
    customerId: row.customer_id ?? undefined,
    customerName: row.customer_name ?? "",
    customerEmail: row.customer_email ?? "",
    customerPhone: row.customer_phone ?? undefined,
    customerCompany: row.customer_company ?? undefined,
    customerAddress: row.customer_address ?? undefined,
    billToType:
      row.bill_to_type === "company" || row.bill_to_type === "individual"
        ? row.bill_to_type
        : undefined,
    total,
    subtotal: meta.subtotal,
    tax: meta.tax,
    taxRate: taxRate || undefined,
    currency: row.currency ?? "USD",
    status: normalizeStatus(row.status),
    dueDate: due,
    createdDate: created,
    finalizedDate: meta.finalizedDate ?? null,
    frequency: meta.frequency ?? null,
    lineItems,
    notes: meta.notes,
    statusHistory: meta.statusHistory,
    archived: meta.archived,
    memo: meta.memo,
    paymentInfo: meta.paymentInfo,
  }
  return inv
}

export function invoiceToDbPayload(input: {
  businessId: string
  customerId: string | null
  invoice: Invoice
  /** When updating, omit invoice_number if unchanged */
  invoiceNumber?: string
}): Record<string, unknown> {
  const { invoice } = input
  const meta: InvoiceMetadata = {
    subtotal: invoice.subtotal,
    tax: invoice.tax,
    archived: invoice.archived,
    memo: invoice.memo,
    notes: invoice.notes,
    statusHistory: invoice.statusHistory,
    paymentInfo: invoice.paymentInfo,
    finalizedDate: invoice.finalizedDate,
    frequency: invoice.frequency,
  }
  const amountCents = Math.round((Number(invoice.total) || 0) * 100)
  const payload: Record<string, unknown> = {
    business_id: input.businessId,
    customer_id: input.customerId,
    amount_cents: amountCents,
    currency: invoice.currency || "USD",
    status: invoice.status,
    due_date: invoice.dueDate || null,
    line_items: invoice.lineItems ?? [],
    tax_rate: invoice.taxRate ?? 0,
    bill_to_type: invoice.billToType ?? null,
    customer_name: invoice.customerName ?? "",
    customer_email: invoice.customerEmail ?? "",
    customer_phone: invoice.customerPhone ?? "",
    customer_company: invoice.customerCompany ?? "",
    customer_address: invoice.customerAddress ?? "",
    metadata: meta,
    updated_at: new Date().toISOString(),
  }
  if (input.invoiceNumber !== undefined) {
    payload.invoice_number = input.invoiceNumber
  } else {
    payload.invoice_number = invoice.invoiceNumber
  }
  return payload
}
