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

function finiteNum(n: unknown, fallback = 0): number {
  const x = typeof n === "number" ? n : Number(n)
  return Number.isFinite(x) ? x : fallback
}

export function mapRowToInvoice(row: B2bInvoiceRow): Invoice {
  const meta = parseInvoiceMetadata(row.metadata)
  const lineItems = parseLineItems(row.line_items)
  const total = centsToAmount(row.amount_cents)
  const taxRate = Number(row.tax_rate ?? 0)
  const due = row.due_date ? String(row.due_date).slice(0, 10) : new Date().toISOString().slice(0, 10)
  const created = row.created_at ? String(row.created_at) : `${due}T00:00:00.000Z`

  const metaSubtotal =
    meta.subtotal != null && Number.isFinite(Number(meta.subtotal)) ? finiteNum(meta.subtotal) : undefined
  let discountRate: number | undefined =
    meta.discountRate != null && Number.isFinite(Number(meta.discountRate))
      ? finiteNum(meta.discountRate)
      : undefined
  let discount: number | undefined =
    meta.discount != null && Number.isFinite(Number(meta.discount)) ? finiteNum(meta.discount) : undefined
  if (discountRate == null && discount != null && metaSubtotal != null && metaSubtotal > 0) {
    discountRate = (discount / metaSubtotal) * 100
  }

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
    discountRate: discountRate != null && discountRate > 0 ? discountRate : undefined,
    discount: discount != null && discount > 0 ? discount : undefined,
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

/** Postgres `uuid` rejects malformed strings — invalid ids must become null. */
export function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value.trim())
}

function safeTrimText(v: unknown, fallback: string): string {
  if (v == null) return fallback
  if (typeof v === "string") return v.trim() || fallback
  if (typeof v === "number" && Number.isFinite(v)) return String(v)
  return String(v).trim() || fallback
}

/** Postgres `date` — only pass YYYY-MM-DD or null. */
function normalizeDueDate(raw: unknown): string | null {
  if (raw == null) return null
  const s = typeof raw === "string" ? raw.trim() : String(raw).trim()
  if (!s) return null
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
  const t = Date.parse(s)
  if (!Number.isFinite(t)) return null
  return new Date(t).toISOString().slice(0, 10)
}

const ALLOWED_INVOICE_STATUS = new Set([
  "draft",
  "open",
  "sent",
  "past_due",
  "paid",
  "void",
  "uncollectible",
  "failed",
])

function normalizeInvoiceStatus(raw: unknown): string {
  const s = typeof raw === "string" ? raw.trim().toLowerCase() : "draft"
  if (ALLOWED_INVOICE_STATUS.has(s)) return s
  if (s === "pastdue" || s === "past-due") return "past_due"
  return "draft"
}

function sanitizeLineItems(items: Invoice["lineItems"] | undefined): InvoiceLineItem[] {
  if (!Array.isArray(items)) return []
  return items.map((row) => ({
    description: String(row?.description ?? ""),
    quantity: finiteNum(row?.quantity, 0),
    unitPrice: finiteNum(row?.unitPrice, 0),
    amount: finiteNum(row?.amount, 0),
  }))
}

export function invoiceToDbPayload(input: {
  businessId: string
  customerId: string | null
  invoice: Invoice
  /** When updating, omit invoice_number if unchanged */
  invoiceNumber?: string
}): Record<string, unknown> {
  const { invoice } = input
  const customerId =
    input.customerId && isUuid(input.customerId) ? input.customerId : null

  const meta: InvoiceMetadata = {
    subtotal:
      invoice.subtotal != null && Number.isFinite(Number(invoice.subtotal))
        ? finiteNum(invoice.subtotal)
        : undefined,
    discountRate:
      invoice.discountRate != null && Number.isFinite(Number(invoice.discountRate))
        ? finiteNum(invoice.discountRate)
        : undefined,
    discount:
      invoice.discount != null && Number.isFinite(Number(invoice.discount))
        ? finiteNum(invoice.discount)
        : undefined,
    tax:
      invoice.tax != null && Number.isFinite(Number(invoice.tax)) ? finiteNum(invoice.tax) : undefined,
    archived: invoice.archived,
    memo: invoice.memo,
    notes: invoice.notes,
    statusHistory: invoice.statusHistory,
    paymentInfo: invoice.paymentInfo,
    finalizedDate: invoice.finalizedDate,
    frequency: invoice.frequency,
  }

  const total = finiteNum(invoice.total, 0)
  const amountCentsRaw = Math.round(total * 100)
  const amountCents = Number.isFinite(amountCentsRaw) ? amountCentsRaw : 0

  const taxRate = finiteNum(invoice.taxRate, 0)

  const billToType =
    invoice.billToType === "individual" || invoice.billToType === "company"
      ? invoice.billToType
      : null

  const lineItems = sanitizeLineItems(invoice.lineItems)

  let metadataJson: InvoiceMetadata
  try {
    metadataJson = JSON.parse(JSON.stringify(meta)) as InvoiceMetadata
  } catch {
    metadataJson = {}
  }

  const invoiceNumberFinal =
    input.invoiceNumber !== undefined
      ? safeTrimText(input.invoiceNumber, "EINV-000")
      : safeTrimText(invoice.invoiceNumber, "EINV-000")

  const payload: Record<string, unknown> = {
    business_id: input.businessId,
    customer_id: customerId,
    amount_cents: amountCents,
    currency: safeTrimText(invoice.currency, "USD").toUpperCase() || "USD",
    status: normalizeInvoiceStatus(invoice.status),
    due_date: normalizeDueDate(invoice.dueDate),
    line_items: lineItems,
    tax_rate: taxRate,
    bill_to_type: billToType,
    customer_name: safeTrimText(invoice.customerName, ""),
    customer_email: safeTrimText(invoice.customerEmail, ""),
    customer_phone: safeTrimText(invoice.customerPhone, ""),
    customer_company: safeTrimText(invoice.customerCompany, ""),
    customer_address: safeTrimText(invoice.customerAddress, ""),
    metadata: metadataJson,
    updated_at: new Date().toISOString(),
  }
  payload.invoice_number = invoiceNumberFinal
  return payload
}
