import { describe, expect, it } from "vitest"
import {
  normalizeInvoiceStatus,
  isInvoiceCustomerLinkShareable,
  isInvoicePubliclyViewable,
  showInvoicePaymentPreview,
  isInvoicePayableStatus,
  getInvoiceManualStatusActions,
  invoiceStatusLabel,
} from "@/lib/invoices/invoice-status"

describe("invoice-status", () => {
  it("normalizes legacy statuses on read", () => {
    expect(normalizeInvoiceStatus("open")).toBe("unpaid")
    expect(normalizeInvoiceStatus("quote")).toBe("draft")
    expect(normalizeInvoiceStatus("uncollectible")).toBe("past_due")
    expect(normalizeInvoiceStatus("failed")).toBe("void")
    expect(normalizeInvoiceStatus("credit_note")).toBe("void")
    expect(normalizeInvoiceStatus("past-due")).toBe("past_due")
  })

  it("labels unpaid consistently", () => {
    expect(invoiceStatusLabel("unpaid")).toBe("Unpaid")
  })

  it("gates customer links to finalized invoices", () => {
    expect(isInvoiceCustomerLinkShareable("draft")).toBe(false)
    expect(isInvoiceCustomerLinkShareable("unpaid")).toBe(true)
    expect(isInvoicePubliclyViewable("draft")).toBe(false)
    expect(isInvoicePubliclyViewable("paid")).toBe(true)
  })

  it("shows payment preview for draft and payable statuses", () => {
    expect(showInvoicePaymentPreview("draft")).toBe(true)
    expect(showInvoicePaymentPreview("unpaid")).toBe(true)
    expect(showInvoicePaymentPreview("paid")).toBe(false)
    expect(isInvoicePayableStatus("sent")).toBe(true)
    expect(isInvoicePayableStatus("void")).toBe(false)
  })

  it("returns only valid manual status actions per lifecycle state", () => {
    expect(getInvoiceManualStatusActions({ status: "draft" })).toEqual([])
    expect(getInvoiceManualStatusActions({ status: "unpaid" }).map((a) => a.id)).toEqual([
      "mark_sent",
      "mark_past_due",
      "mark_paid",
      "mark_void",
    ])
    expect(getInvoiceManualStatusActions({ status: "unpaid", paidViaStripe: true }).map((a) => a.id)).toEqual([
      "mark_sent",
      "mark_past_due",
      "mark_void",
    ])
    expect(getInvoiceManualStatusActions({ status: "sent" }).map((a) => a.id)).toEqual([
      "mark_paid",
      "mark_past_due",
      "mark_unpaid",
      "mark_void",
    ])
    expect(getInvoiceManualStatusActions({ status: "paid", paidViaStripe: true })).toEqual([])
    expect(getInvoiceManualStatusActions({ status: "void" }).map((a) => a.id)).toEqual(["mark_unpaid"])
  })
})
