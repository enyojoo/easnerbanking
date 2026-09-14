import { afterEach, describe, expect, it } from "vitest"
import {
  resolveBusinessFromEmail,
  resolveInvoiceFromEmailAddress,
  resolvePersonalFromEmail,
  resolveReceiptFromEmailAddress,
} from "./email-from"

describe("email-from", () => {
  afterEach(() => {
    delete process.env.EMAIL_FROM
    delete process.env.BUSINESS_EMAIL_FROM
    delete process.env.INVOICE_EMAIL_FROM
    delete process.env.RECEIPT_EMAIL_FROM
    delete process.env.SENDGRID_FROM_EMAIL
    delete process.env.SENDGRID_FROM_EMAIL_BUSINESS
    delete process.env.SENDGRID_FROM_EMAIL_INVOICES
    delete process.env.SENDGRID_FROM_EMAIL_RECEIPTS
  })

  it("defaults personal/business/invoice/receipt addresses", () => {
    expect(resolvePersonalFromEmail()).toBe("noreply@easner.com")
    expect(resolveBusinessFromEmail()).toBe("business@easner.com")
    expect(resolveInvoiceFromEmailAddress()).toBe("invoices@easner.com")
    expect(resolveReceiptFromEmailAddress()).toBe("receipt@easner.com")
  })

  it("prefers EMAIL_* over SENDGRID_*", () => {
    process.env.SENDGRID_FROM_EMAIL = "old@easner.com"
    process.env.EMAIL_FROM = "new@easner.com"
    expect(resolvePersonalFromEmail()).toBe("new@easner.com")
  })
})
