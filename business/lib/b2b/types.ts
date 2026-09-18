export interface InvoiceLineItem {
  description: string
  quantity: number
  unitPrice: number
  amount: number
}

export interface InvoicePaymentInfo {
  paidAt: string
  method: "easner" | "cash" | "stripe"
  transactionId?: string
  cashNote?: string
  stripe?: {
    paymentIntentId: string
    chargeId?: string
    paymentMethodType?: string
    brand?: string
    last4?: string
    wallet?: string | null
    bankName?: string
    customerEmail?: string
    customerName?: string
    grossCents: number
    feeCents: number
    netCents: number
    settlementPhase: "payment_received" | "payout_sent" | "credited" | "failed"
    settlementRail?: "grid_va" | "bridge_va" | "turnkey_stablecoin"
    /** Set when the Stripe payment was fully refunded. */
    refundId?: string
    refundedAt?: string
  }
}

/** Business-level defaults stored in `businesses.invoice_settings`. */
export type InvoicePaymentDefaults = {
  showBankTransfer: boolean
  showStablecoin: boolean
  /** When false, hide Pay online even if Stripe is enabled. Default true when Stripe is on. */
  showOnlinePayment?: boolean
  preferredMethod: "bank" | "stablecoin" | "online" | "customer_choice"
  includePaymentOnPdf: boolean
  includePaymentInEmail: boolean
  notifyOnInvoiceView?: boolean
  /** Email org reply-to when an invoice is paid (default true). */
  notifyOnInvoicePaid?: boolean
  sendReceiptOnPaid?: boolean
  sendDueDateReminder?: boolean
  sendOverdueReminder?: boolean
  brandColor?: string
  footerText?: string
}

/** Per-invoice overrides stored in `invoices.metadata.paymentDisplay`. */
export type InvoicePaymentDisplay = {
  showBank: boolean
  showStablecoin: boolean
  showOnlinePayment?: boolean
  defaultTab?: "bank" | "stablecoin" | "online"
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
  status: "draft" | "unpaid" | "sent" | "past_due" | "paid" | "void"
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
  /** Reminder emails sent (stored in metadata). */
  remindersSent?: { type: string; sentAt: string }[]
  /** Manual / issue emails sent (stored in metadata). */
  emailsSent?: { sentAt: string; to?: string }[]
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
