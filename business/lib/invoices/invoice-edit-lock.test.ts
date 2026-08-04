import { describe, expect, it } from "vitest"
import {
  isInvoiceFieldsLocked,
  invoiceFieldsLockBanner,
  showInvoicePaymentPreview,
} from "@/lib/invoices/invoice-edit-lock"

describe("invoice-edit-lock", () => {
  it("locks only sent and past_due", () => {
    expect(isInvoiceFieldsLocked("sent")).toBe(true)
    expect(isInvoiceFieldsLocked("past_due")).toBe(true)
    expect(isInvoiceFieldsLocked("void")).toBe(false)
    expect(isInvoiceFieldsLocked("unpaid")).toBe(false)
    expect(isInvoiceFieldsLocked("draft")).toBe(false)
    expect(isInvoiceFieldsLocked("paid")).toBe(false)
  })

  it("shows banner only when locked", () => {
    expect(invoiceFieldsLockBanner("sent")).toContain("shared with your customer")
    expect(invoiceFieldsLockBanner("void")).toBeNull()
  })

  it("shows payment preview for draft and unpaid", () => {
    expect(showInvoicePaymentPreview("draft")).toBe(true)
    expect(showInvoicePaymentPreview("unpaid")).toBe(true)
    expect(showInvoicePaymentPreview("paid")).toBe(false)
  })
})
