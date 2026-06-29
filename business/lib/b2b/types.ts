export interface InvoiceLineItem {
  description: string
  quantity: number
  unitPrice: number
  amount: number
}

export interface InvoicePaymentInfo {
  paidAt: string
  method: "easner" | "cash"
  transactionId?: string
  cashNote?: string
}

/** Business-level defaults stored in `businesses.invoice_settings`. */
export type InvoicePaymentDefaults = {
  showBankTransfer: boolean
  showStablecoin: boolean
  preferredMethod: "bank" | "stablecoin" | "customer_choice"
  includePaymentOnPdf: boolean
  includePaymentInEmail: boolean
  notifyOnInvoiceView?: boolean
  sendReceiptOnPaid?: boolean
  brandColor?: string
  footerText?: string
}

/** Per-invoice overrides stored in `invoices.metadata.paymentDisplay`. */
export type InvoicePaymentDisplay = {
  showBank: boolean
  showStablecoin: boolean
  defaultTab?: "bank" | "stablecoin"
}

export interface Invoice {
  id: string
  invoiceNumber: string
  /** Customer id for linking to Customer record. When absent, matched by customerEmail. */
  customerId?: string
  customerName: string
  customerEmail: string
  subtotal?: number
  /** Invoice-level discount as percent of subtotal (0–100). */
  discountRate?: number
  /** Absolute discount amount (subtotal × discountRate / 100). */
  discount?: number
  taxRate?: number
  tax?: number
  total: number
  currency: string
  status: "draft" | "quote" | "open" | "sent" | "past_due" | "paid" | "void" | "uncollectible" | "failed" | "credit_note"
  dueDate: string
  /** Creation instant: full ISO from `invoices.created_at` after load; date-only possible briefly from client-only state. */
  createdDate: string
  finalizedDate: string | null
  frequency: string | null
  lineItems: InvoiceLineItem[]
  billToType?: "individual" | "company"
  customerAddress?: string
  customerPhone?: string
  customerCompany?: string
  notes?: { id: string; text: string; createdAt: string }[]
  statusHistory?: { status: string; timestamp: string }[]
  archived?: boolean
  memo?: string
  /** PO or customer reference for reconciliation (stored in metadata). */
  poNumber?: string
  /** Per-invoice payment method visibility (stored in metadata). */
  paymentDisplay?: InvoicePaymentDisplay
  /** Quote vs invoice document type (stored in metadata). */
  documentType?: "quote" | "invoice"
  /** Parent invoice id for credit notes (stored in metadata). */
  creditForInvoiceId?: string
  /** Reminder emails sent (stored in metadata). */
  remindersSent?: { type: string; sentAt: string }[]
  paymentInfo?: InvoicePaymentInfo
}

export interface Customer {
  id: string
  name: string
  email: string
  phone: string
  company: string
  address: string
  totalInvoices: number
  totalPaid: number
  currency: string
  status: "active" | "inactive"
  lastInvoiceDate: string
  /** Net payment terms in days (default 30). */
  paymentTermsDays?: number
}
