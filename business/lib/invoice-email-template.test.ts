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
  it("uses standard Easner logo, Dear-first body, and invoice footer disclaimer", () => {
    const html = generateInvoiceEmailHtml({
      invoice: sampleInvoice,
      invoiceViewUrl: "https://example.com/invoice-view/inv_1",
      businessName: "Acme Ltd",
      businessReplyEmail: "billing@acme.com",
      issuer: sampleIssuer,
      includePaymentContext: true,
      paymentMethods: { hasOnline: true, hasBank: true, hasStablecoin: false },
    })
    expect(html).toContain("Easner%20Logo.png")
    expect(html).toContain("logo-light")
    expect(html).toContain("Dear Jane Doe")
    expect(html).toContain("Acme Ltd has sent you an invoice")
    expect(html).toContain("pay online")
    expect(html).toContain("View &amp; pay invoice")
    expect(html).toContain("Invoice number")
    expect(html).toContain("INV-001")
    expect(html).toContain("$100.00 USD")
    expect(html).toContain("word-break:break-word")
    expect(html).not.toContain('<h1 class="email-title">')
    expect(html).toContain(
      "You're receiving this email because Acme Ltd uses Easner Business Banking services to manage their business processes.",
    )
    expect(html).toContain("If you have any questions about this invoice, email")
    expect(html).toContain('href="mailto:billing@acme.com"')
    expect(html).toContain("billing@acme.com")
    expect(html).toContain("Easner Group, Inc.")
    expect(html).toContain("All rights reserved")
    expect(html).toContain("584 Castro St")
    expect(html).not.toContain("Contact Support")
    expect(html).not.toContain("You received this email because you have an Easner account")
    expect(html).not.toContain("10 Market St")
    expect(html).not.toContain("United Kingdom")
  })

  it("renders customer viewed notification with shared template shell", () => {
    const html = generateInvoiceViewedNotificationHtml({
      invoice: sampleInvoice,
      businessName: "Acme Ltd",
      manageInvoiceUrl: "https://business.easner.com/invoices/inv_1",
      recipientFirstName: "Alex",
    })
    expect(html).toContain("Hey Alex,")
    expect(html).toContain("Jane Doe viewed invoice")
    expect(html).not.toContain('<h1 class="email-title">')
    expect(html).toContain("View invoice</a>")
    expect(html).toContain("Easner Group, Inc.")
  })

  it("uses invoice customer footer on receipt email", () => {
    const html = generateInvoiceReceiptEmailHtml({
      invoice: { ...sampleInvoice, status: "paid" },
      invoiceViewUrl: "https://example.com/invoice-view/inv_1",
      businessName: "Acme Ltd",
      businessReplyEmail: "billing@acme.com",
      issuer: sampleIssuer,
    })
    expect(html).toContain("Easner%20Logo.png")
    expect(html).toContain("Dear Jane Doe")
    expect(html).toContain("Thank you")
    expect(html).toContain("from Acme Ltd")
    expect(html).toContain(
      "You're receiving this email because Acme Ltd uses Easner Business Banking services",
    )
    expect(html).toContain("Easner Group, Inc.")
    expect(html).not.toContain("10 Market St")
  })
})
