import { describe, expect, it } from "vitest"
import {
  formatInvoiceEmailBusinessLines,
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

describe("invoice email business header", () => {
  it("omits empty address lines", () => {
    const lines = formatInvoiceEmailBusinessLines(
      {
        name: "Acme Ltd",
        address: "",
        city: "",
        state: "",
        zipCode: "",
        country: "",
        email: "",
        phone: "",
      },
      "billing@acme.com",
    )
    expect(lines).toEqual(["Acme Ltd", "billing@acme.com"])
  })

  it("does not render placeholder Your Business block", () => {
    const html = generateInvoiceEmailHtml({
      invoice: sampleInvoice,
      invoiceViewUrl: "https://example.com/invoice-view/inv_1",
      businessName: "Acme Ltd",
      businessReplyEmail: "billing@acme.com",
      issuer: {
        name: "Acme Ltd",
        address: "10 Market St",
        city: "London",
        state: "",
        zipCode: "EC1A 1BB",
        country: "United Kingdom",
        email: "billing@acme.com",
        phone: "+44 20 7946 0958",
      },
    })
    expect(html).toContain("<strong>Acme Ltd</strong>")
    expect(html).toContain("10 Market St")
    expect(html).not.toContain("Your Business")
    expect(html).not.toContain("<p>,</p>")
    expect(html).not.toContain(" | </p>")
  })

  it("renders styled customer viewed notification", () => {
    const html = generateInvoiceViewedNotificationHtml({
      invoice: sampleInvoice,
      businessName: "Acme Ltd",
      manageInvoiceUrl: "https://business.easner.com/invoices/inv_1",
    })
    expect(html).toContain("Easner Business")
    expect(html).toContain("Hello Acme Ltd")
    expect(html).toContain("Jane Doe viewed invoice")
    expect(html).toContain("View invoice</a>")
    expect(html).not.toContain("<p>Jane Doe viewed")
  })

  it("renders styled payment receipt email", () => {
    const html = generateInvoiceReceiptEmailHtml({
      invoice: { ...sampleInvoice, status: "paid" },
      invoiceViewUrl: "https://example.com/invoice-view/inv_1",
      businessName: "Acme Ltd",
      businessReplyEmail: "billing@acme.com",
      issuer: {
        name: "Acme Ltd",
        address: "10 Market St",
        city: "London",
        state: "",
        zipCode: "EC1A 1BB",
        country: "United Kingdom",
        email: "billing@acme.com",
        phone: "",
      },
    })
    expect(html).toContain("Payment received")
    expect(html).toContain("Thank you")
    expect(html).toContain("<strong>Acme Ltd</strong>")
  })
})
