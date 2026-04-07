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
  status: "draft" | "open" | "sent" | "past_due" | "paid" | "void" | "uncollectible" | "failed"
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
}
