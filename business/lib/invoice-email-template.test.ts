import { describe, expect, it } from "vitest"
import {
  generateInvoiceEmailHtml,
  generateInvoiceReceiptEmailHtml,
  generateInvoiceViewedNotificationHtml,
} from "@/lib/invoice-email-template"
import type { Invoice } from "@/lib/b2b/types"

const sampleInvoice: Invoice = {
  id: "inv_1",
  invoiceNumber: "INV-001",
  customerName: "Jane Doe",
  customerEmail: "jane@example.com",
  subtotal: 100,
  discountRate: 0,
  discount: 0,
  taxRate: 0,
  tax: 0,
  total: 100,
  currency: "USD",
  status: "sent",
  createdDate: "2026-01-01T00:00:00.000Z",
  finalizedDate: "2026-01-01T00:00:00.000Z",
  dueDate: "2026-02-01",
  frequency: null,
  lineItems: [{ description: "Service", quantity: 1, unitPrice: 100, amount: 100 }],
}

const sampleIssuer = {
  name: "Acme Ltd",
  address: "10 Market St",
  city: "London",
  state: "",
  zipCode: "EC1A 1BB",
  country: "United Kingdom",
  email: "billing@acme.com",
  phone: "+44 20 7946 0958",
}

describe("invoice email templates", () => {
  it("uses shared email footer and does not render merchant address in body", () => {
    const html = generateInvoiceEmailHtml({
      invoice: sampleInvoice,
      invoiceViewUrl: "https://example.com/invoice-view/inv_1",
      businessName: "Acme Ltd",
      businessReplyEmail: "billing@acme.com",
      issuer: sampleIssuer,
    })
    expect(html).toContain("Acme Ltd has sent you an invoice")
    expect(html).toContain("billing@acme.com")
    expect(html).toContain("Easner Group, Inc.")
    expect(html).toContain("All rights reserved")
    expect(html).toContain("584 Castro St")
    expect(html).toContain("Contact Support")
    expect(html).not.toContain("10 Market St")
    expect(html).not.toContain("United Kingdom")
  })

  it("renders customer viewed notification with shared template shell", () => {
    const html = generateInvoiceViewedNotificationHtml({
      invoice: sampleInvoice,
      businessName: "Acme Ltd",
      manageInvoiceUrl: "https://business.easner.com/invoices/inv_1",
    })
    expect(html).toContain("Hello Acme Ltd")
    expect(html).toContain("Jane Doe viewed invoice")
    expect(html).toContain("View invoice</a>")
    expect(html).toContain("Easner Group, Inc.")
  })

  it("does not render merchant address block in receipt email", () => {
    const html = generateInvoiceReceiptEmailHtml({
      invoice: { ...sampleInvoice, status: "paid" },
      invoiceViewUrl: "https://example.com/invoice-view/inv_1",
      businessName: "Acme Ltd",
      businessReplyEmail: "billing@acme.com",
      issuer: sampleIssuer,
    })
    expect(html).toContain("Payment received")
    expect(html).toContain("Thank you")
    expect(html).toContain("from Acme Ltd")
    expect(html).toContain("Easner Group, Inc.")
    expect(html).not.toContain("10 Market St")
  })
})
