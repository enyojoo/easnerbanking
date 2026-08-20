import type { Invoice } from "@/lib/b2b/types"
import {
  INVOICE_ACTION_COPY,
  INVOICE_SHARE_COPY,
  INVOICE_STATUS_COPY,
  INVOICE_TOAST_COPY,
} from "@/lib/copy/business-ui-copy"

/** Active invoice lifecycle statuses. */
export type InvoiceStatus = Invoice["status"]

export const INVOICE_STATUSES = [
  "draft",
  "unpaid",
  "sent",
  "past_due",
  "paid",
  "void",
] as const satisfies readonly InvoiceStatus[]

/** Map retired DB/API values to the current lifecycle on read. */
const LEGACY_STATUS_MAP: Record<string, InvoiceStatus> = {
  open: "unpaid",
  quote: "draft",
  uncollectible: "past_due",
  failed: "void",
  credit_note: "void",
}

export function normalizeInvoiceStatus(raw: string | null | undefined): InvoiceStatus {
  const v = (raw ?? "draft").trim().toLowerCase()
  if (LEGACY_STATUS_MAP[v]) return LEGACY_STATUS_MAP[v]
  if ((INVOICE_STATUSES as readonly string[]).includes(v)) return v as InvoiceStatus
  if (v === "pastdue" || v === "past-due") return "past_due"
  return "draft"
}

export function isInvoiceDraft(status: InvoiceStatus): boolean {
  return status === "draft"
}

/** Issued invoices customers may view via the public link. */
export function isInvoicePubliclyViewable(status: InvoiceStatus): boolean {
  return !isInvoiceDraft(status)
}

/** Same as public view – customer link is copyable once issued. */
export function isInvoiceCustomerLinkShareable(status: InvoiceStatus): boolean {
  return isInvoicePubliclyViewable(status)
}

/** Pay rails and payment preview apply to unpaid issued invoices. */
export function isInvoicePayableStatus(status: InvoiceStatus): boolean {
  return status === "unpaid" || status === "sent" || status === "past_due"
}

/** Merchant preview of customer payment block while drafting or before payment. */
export function showInvoicePaymentPreview(status: InvoiceStatus): boolean {
  return isInvoiceDraft(status) || isInvoicePayableStatus(status)
}

export function invoiceStatusLabel(status: InvoiceStatus): string {
  const entry = INVOICE_STATUS_COPY[status as keyof typeof INVOICE_STATUS_COPY]
  return entry?.label ?? status
}

export function invoiceStatusHelper(status: InvoiceStatus): string | null {
  const entry = INVOICE_STATUS_COPY[status as keyof typeof INVOICE_STATUS_COPY]
  return entry?.helper ?? null
}

export function invoiceStatusNextAction(status: InvoiceStatus): string | null {
  const entry = INVOICE_STATUS_COPY[status as keyof typeof INVOICE_STATUS_COPY]
  return entry?.nextAction ?? null
}

export function customerLinkHint(status: InvoiceStatus): string {
  switch (status) {
    case "unpaid":
      return INVOICE_SHARE_COPY.customerLinkHintUnpaid
    case "sent":
    case "past_due":
      return INVOICE_SHARE_COPY.customerLinkHintSent
    case "paid":
      return INVOICE_SHARE_COPY.customerLinkHintPaid
    case "void":
      return INVOICE_SHARE_COPY.customerLinkHintVoid
    default:
      return INVOICE_SHARE_COPY.customerLinkHintDefault
  }
}

export function previewLinkHint(): string {
  return INVOICE_SHARE_COPY.previewHint
}

export function draftPreviewHint(): string {
  return INVOICE_SHARE_COPY.draftPreviewHint
}

export type InvoiceManualStatusActionId =
  | "mark_sent"
  | "mark_past_due"
  | "mark_paid"
  | "mark_unpaid"
  | "mark_void"

export type InvoiceManualStatusAction = {
  id: InvoiceManualStatusActionId
  label: string
  targetStatus: InvoiceStatus
  destructive?: boolean
}

/** Manual status changes allowed from the invoice detail dropdown (not email/issue flows). */
export function getInvoiceManualStatusActions(input: {
  status: InvoiceStatus
  paidViaStripe?: boolean
}): InvoiceManualStatusAction[] {
  const { status, paidViaStripe } = input

  if (status === "draft") return []

  if (status === "unpaid") {
    const actions: InvoiceManualStatusAction[] = [
      { id: "mark_sent", label: INVOICE_ACTION_COPY.markSent, targetStatus: "sent" },
      { id: "mark_past_due", label: INVOICE_ACTION_COPY.markPastDue, targetStatus: "past_due" },
      { id: "mark_void", label: INVOICE_ACTION_COPY.voidInvoice, targetStatus: "void", destructive: true },
    ]
    if (!paidViaStripe) {
      actions.splice(2, 0, {
        id: "mark_paid",
        label: INVOICE_ACTION_COPY.markPaid,
        targetStatus: "paid",
      })
    }
    return actions
  }

  if (status === "sent") {
    const actions: InvoiceManualStatusAction[] = [
      { id: "mark_past_due", label: INVOICE_ACTION_COPY.markPastDue, targetStatus: "past_due" },
      { id: "mark_unpaid", label: INVOICE_ACTION_COPY.markUnpaid, targetStatus: "unpaid" },
      { id: "mark_void", label: INVOICE_ACTION_COPY.voidInvoice, targetStatus: "void", destructive: true },
    ]
    if (!paidViaStripe) {
      actions.unshift({
        id: "mark_paid",
        label: INVOICE_ACTION_COPY.markPaid,
        targetStatus: "paid",
      })
    }
    return actions
  }

  if (status === "past_due") {
    const actions: InvoiceManualStatusAction[] = [
      { id: "mark_sent", label: INVOICE_ACTION_COPY.markSent, targetStatus: "sent" },
      { id: "mark_unpaid", label: INVOICE_ACTION_COPY.markUnpaid, targetStatus: "unpaid" },
      { id: "mark_void", label: INVOICE_ACTION_COPY.voidInvoice, targetStatus: "void", destructive: true },
    ]
    if (!paidViaStripe) {
      actions.splice(1, 0, {
        id: "mark_paid",
        label: INVOICE_ACTION_COPY.markPaid,
        targetStatus: "paid",
      })
    }
    return actions
  }

  if (status === "paid") {
    if (paidViaStripe) return []
    return [{ id: "mark_unpaid", label: INVOICE_ACTION_COPY.markUnpaid, targetStatus: "unpaid" }]
  }

  if (status === "void") {
    return [
      { id: "mark_unpaid", label: INVOICE_ACTION_COPY.reopenUnpaid, targetStatus: "unpaid" },
    ]
  }

  return []
}

export function manualStatusChangeToast(action: InvoiceManualStatusAction): string {
  switch (action.id) {
    case "mark_sent":
      return INVOICE_TOAST_COPY.markedSent
    case "mark_past_due":
      return INVOICE_TOAST_COPY.markedPastDue
    case "mark_paid":
      return INVOICE_TOAST_COPY.markedPaid
    case "mark_unpaid":
      return action.label === INVOICE_ACTION_COPY.reopenUnpaid
        ? INVOICE_TOAST_COPY.reopenedUnpaid
        : INVOICE_TOAST_COPY.revertedUnpaid
    case "mark_void":
      return INVOICE_TOAST_COPY.voided
    default:
      return INVOICE_TOAST_COPY.statusUpdated
  }
}
