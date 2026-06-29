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
    expect(isInvoiceFieldsLocked("open")).toBe(false)
    expect(isInvoiceFieldsLocked("draft")).toBe(false)
    expect(isInvoiceFieldsLocked("paid")).toBe(false)
  })

  it("shows banner only when locked", () => {
    expect(invoiceFieldsLockBanner("sent")).toContain("shared with your customer")
    expect(invoiceFieldsLockBanner("void")).toBeNull()
  })

  it("shows payment preview for draft and open", () => {
    expect(showInvoicePaymentPreview("draft")).toBe(true)
    expect(showInvoicePaymentPreview("open")).toBe(true)
    expect(showInvoicePaymentPreview("quote")).toBe(false)
    expect(showInvoicePaymentPreview("draft", "quote")).toBe(false)
  })
})
