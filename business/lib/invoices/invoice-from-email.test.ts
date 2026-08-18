import { afterEach, describe, expect, it } from "vitest"
import { resolveInvoiceFromEmail, resolveReceiptFromEmail } from "@/lib/invoices/invoice-from-email"

describe("resolveInvoiceFromEmail", () => {
  afterEach(() => {
    delete process.env.SENDGRID_FROM_EMAIL_INVOICES
    delete process.env.SENDGRID_FROM_EMAIL_RECEIPTS
    delete process.env.SENDGRID_FROM_EMAIL_BUSINESS
    delete process.env.SENDGRID_FROM_NAME_INVOICES
    delete process.env.SENDGRID_FROM_NAME_BUSINESS
  })

  it("defaults to invoices@easner.com even when business from is set", () => {
    process.env.SENDGRID_FROM_EMAIL_BUSINESS = "business@easner.com"
    expect(resolveInvoiceFromEmail().email).toBe("invoices@easner.com")
  })

  it("allows explicit invoice override", () => {
    process.env.SENDGRID_FROM_EMAIL_INVOICES = "billing@easner.com"
    expect(resolveInvoiceFromEmail().email).toBe("billing@easner.com")
  })
})

describe("resolveReceiptFromEmail", () => {
  afterEach(() => {
    delete process.env.SENDGRID_FROM_EMAIL_RECEIPTS
    delete process.env.SENDGRID_FROM_EMAIL_INVOICES
    delete process.env.SENDGRID_FROM_EMAIL_BUSINESS
    delete process.env.SENDGRID_FROM_NAME_BUSINESS
  })

  it("defaults to receipt@easner.com and does not use invoices@", () => {
    process.env.SENDGRID_FROM_EMAIL_INVOICES = "invoices@easner.com"
    expect(resolveReceiptFromEmail().email).toBe("receipt@easner.com")
  })

  it("allows explicit receipt override", () => {
    process.env.SENDGRID_FROM_EMAIL_RECEIPTS = "receipts@easner.com"
    expect(resolveReceiptFromEmail().email).toBe("receipts@easner.com")
  })
})
