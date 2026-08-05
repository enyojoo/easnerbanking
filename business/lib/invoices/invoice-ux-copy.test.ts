import { describe, expect, it } from "vitest"
import {
  INVOICE_ACTION_COPY,
  INVOICE_LIST_COPY,
  INVOICE_SETTINGS_COPY,
  INVOICE_SHARE_COPY,
  INVOICE_STATUS_COPY,
  INVOICE_TOAST_COPY,
} from "@/lib/copy/business-ui-copy"
import {
  customerLinkHint,
  draftPreviewHint,
  isInvoiceCustomerLinkShareable,
  invoiceStatusLabel,
  manualStatusChangeToast,
  getInvoiceManualStatusActions,
} from "@/lib/invoices/invoice-status"
import { invoicesDueForReminder } from "@/lib/invoice-reminder-service"
import { parseBusinessInvoiceSettings } from "@/lib/invoices/invoice-settings"
import type { B2bInvoiceRow } from "@/lib/b2b/map-invoice"

describe("invoice UX copy", () => {
  it("uses short familiar send/create labels (not Finalize)", () => {
    expect(INVOICE_ACTION_COPY.issue).toBe("Create")
    expect(INVOICE_ACTION_COPY.issueAndEmail).toBe("Send")
    expect(INVOICE_TOAST_COPY.issued).toBe("Invoice issued")
    expect(JSON.stringify(INVOICE_ACTION_COPY).toLowerCase()).not.toContain("finalize")
    expect(JSON.stringify(INVOICE_TOAST_COPY).toLowerCase()).not.toContain("finalize")
  })

  it("uses Easner-first settings labels", () => {
    expect(INVOICE_SETTINGS_COPY.bankTransferHelp).toContain("bank transfer details")
    expect(INVOICE_SETTINGS_COPY.bankTransferHelp.toLowerCase()).not.toContain("virtual account")
    expect(INVOICE_SETTINGS_COPY.defaultPaymentOption).toBe("Default payment option")
    expect(INVOICE_SETTINGS_COPY.onlinePayments).toBe("Online payments")
  })

  it("wires status helpers through share/status copy", () => {
    expect(invoiceStatusLabel("unpaid")).toBe(INVOICE_STATUS_COPY.unpaid.label)
    expect(customerLinkHint("unpaid")).toBe(INVOICE_SHARE_COPY.customerLinkHintUnpaid)
    expect(draftPreviewHint()).toBe(INVOICE_SHARE_COPY.draftPreviewHint)
    expect(draftPreviewHint().toLowerCase()).toContain("issue")
  })

  it("gates customer link share by status", () => {
    expect(isInvoiceCustomerLinkShareable("draft")).toBe(false)
    expect(isInvoiceCustomerLinkShareable("unpaid")).toBe(true)
    expect(isInvoiceCustomerLinkShareable("void")).toBe(true)
  })

  it("keeps Mark as sent only as a manual status action", () => {
    const unpaid = getInvoiceManualStatusActions({ status: "unpaid" })
    expect(unpaid.some((a) => a.id === "mark_sent")).toBe(true)
    expect(manualStatusChangeToast(unpaid.find((a) => a.id === "mark_sent")!)).toBe(
      INVOICE_TOAST_COPY.markedSent,
    )
  })

  it("provides list empty-state copy for each tab", () => {
    expect(INVOICE_LIST_COPY.emptyDraft).toBeTruthy()
    expect(INVOICE_LIST_COPY.emptyPastDue).toBeTruthy()
    expect("pastDueEmphasis" in INVOICE_LIST_COPY).toBe(false)
  })
})

describe("invoice reminder settings gating", () => {
  const baseRow = {
    id: "11111111-1111-4111-8111-111111111111",
    business_id: "22222222-2222-4222-8222-222222222222",
    invoice_number: "INV-1",
    status: "sent",
    currency: "USD",
    amount_cents: 10000,
    due_date: "2026-08-05",
    created_at: "2026-08-01T00:00:00.000Z",
    updated_at: "2026-08-01T00:00:00.000Z",
    metadata: {},
    customer_name: "Acme",
    customer_email: "a@example.com",
  } as unknown as B2bInvoiceRow

  it("defaults reminder toggles to on", () => {
    const settings = parseBusinessInvoiceSettings({})
    expect(settings.sendDueDateReminder).toBe(true)
    expect(settings.sendOverdueReminder).toBe(true)
  })

  it("skips due-date reminders when disabled", () => {
    const due = invoicesDueForReminder([baseRow], "2026-08-05", {
      sendDueDateReminder: false,
      sendOverdueReminder: true,
    })
    expect(due).toEqual([])
  })

  it("includes due-date reminders when enabled", () => {
    const due = invoicesDueForReminder([baseRow], "2026-08-05", {
      sendDueDateReminder: true,
      sendOverdueReminder: true,
    })
    expect(due).toHaveLength(1)
    expect(due[0]?.type).toBe("due_today")
  })

  it("skips overdue reminders when disabled", () => {
    const overdueRow = {
      ...baseRow,
      due_date: "2026-07-20",
    } as unknown as B2bInvoiceRow
    const due = invoicesDueForReminder([overdueRow], "2026-08-05", {
      sendDueDateReminder: true,
      sendOverdueReminder: false,
    })
    expect(due).toEqual([])
  })
})
