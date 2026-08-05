import { describe, expect, it } from "vitest"
import {
  generateInvoiceCustomerRefundEmailHtml,
  generateInvoiceEmailHtml,
  generateInvoicePaidNotificationHtml,
  generateInvoiceReceiptEmailHtml,
  generateInvoiceRefundedNotificationHtml,
  generateInvoiceViewedNotificationHtml,
  getInvoiceCustomerRefundEmailSubject,
  getInvoiceEmailSubject,
  getInvoicePaidNotificationSubject,
  getInvoiceRefundedNotificationSubject,
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
      invoiceViewUrl: "https://example.com/invoice/inv_1",
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

  it("renders merchant paid notification for business Reply-To", () => {
    expect(getInvoicePaidNotificationSubject("INV-001")).toBe("Invoice INV-001 was paid")
    const html = generateInvoicePaidNotificationHtml({
      invoice: { ...sampleInvoice, status: "paid" },
      businessName: "Acme Ltd",
      manageInvoiceUrl: "https://business.easner.com/invoices/inv_1",
      recipientFirstName: "Alex",
      paymentMethodLabel: "Online",
    })
    expect(html).toContain("Hey Alex,")
    expect(html).toContain("Jane Doe paid invoice")
    expect(html).toContain("Online")
    expect(html).toContain("View invoice</a>")
    expect(html).toContain("invoice payment notifications")
  })

  it("renders merchant refunded notification", () => {
    expect(getInvoiceRefundedNotificationSubject("INV-001")).toBe(
      "Invoice INV-001 payment was refunded",
    )
    const html = generateInvoiceRefundedNotificationHtml({
      invoice: { ...sampleInvoice, status: "sent" },
      businessName: "Acme Ltd",
      manageInvoiceUrl: "https://business.easner.com/invoices/inv_1",
      recipientFirstName: "Alex",
    })
    expect(html).toContain("Hey Alex,")
    expect(html).toContain("was refunded")
    expect(html).toContain("Refunded")
    expect(html).toContain("View invoice</a>")
  })

  it("renders customer refund email with payment method and When", () => {
    expect(getInvoiceCustomerRefundEmailSubject("INV-001")).toBe(
      "Payment refunded for invoice INV-001",
    )
    const html = generateInvoiceCustomerRefundEmailHtml({
      invoice: {
        ...sampleInvoice,
        status: "sent",
        paymentInfo: {
          paidAt: "2026-08-03T04:54:00.000Z",
          method: "stripe",
          stripe: {
            paymentIntentId: "pi_1",
            paymentMethodType: "card",
            brand: "visa",
            last4: "4242",
            grossCents: 10000,
            feeCents: 300,
            netCents: 9700,
            settlementPhase: "failed",
            refundId: "re_1",
            refundedAt: "2026-08-05T13:15:00.000Z",
          },
        },
      },
      invoiceViewUrl: "https://example.com/invoice/inv_1",
      businessName: "Acme Ltd",
      businessReplyEmail: "billing@acme.com",
      issuer: sampleIssuer,
    })
    expect(html).toContain("Dear Jane Doe")
    expect(html).toContain("has been refunded")
    expect(html).toContain(">Payment method<")
    expect(html).toContain("4242")
    expect(html).toContain(">When<")
    expect(html).toContain("Refunded")
    expect(html).toContain("from Acme Ltd")
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

  it("overrides copy for due-today reminders even when status is sent", () => {
    const data = {
      invoice: sampleInvoice,
      invoiceViewUrl: "https://example.com/invoice/inv_1",
      businessName: "Acme Ltd",
      businessReplyEmail: "billing@acme.com",
      issuer: sampleIssuer,
      reminderType: "due_today" as const,
    }
    expect(getInvoiceEmailSubject(data)).toBe(
      "Reminder: Invoice due today from Acme Ltd – INV-001",
    )
    const html = generateInvoiceEmailHtml(data)
    expect(html).toContain("This is a reminder that your invoice is due today.")
    expect(html).not.toContain("has sent you an invoice")
  })

  it("overrides copy for overdue reminders when status is still unpaid", () => {
    const data = {
      invoice: { ...sampleInvoice, status: "unpaid" as const },
      invoiceViewUrl: "https://example.com/invoice/inv_1",
      businessName: "Acme Ltd",
      businessReplyEmail: "billing@acme.com",
      issuer: sampleIssuer,
      reminderType: "overdue_7d" as const,
    }
    expect(getInvoiceEmailSubject(data)).toBe("Reminder: Your invoice from Acme Ltd – INV-001")
    const html = generateInvoiceEmailHtml(data)
    expect(html).toContain("This is a reminder that your invoice is past due.")
  })

  it("uses invoice customer footer on receipt email", () => {
    const html = generateInvoiceReceiptEmailHtml({
      invoice: { ...sampleInvoice, status: "paid" },
      invoiceViewUrl: "https://example.com/invoice/inv_1",
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

  it("includes payment method and When on receipt email for Stripe payments", () => {
    const paidAt = "2026-08-03T04:54:00.000Z"
    const html = generateInvoiceReceiptEmailHtml({
      invoice: {
        ...sampleInvoice,
        status: "paid",
        paymentInfo: {
          paidAt,
          method: "stripe",
          stripe: {
            paymentIntentId: "pi_1",
            paymentMethodType: "card",
            brand: "visa",
            last4: "4242",
            grossCents: 10000,
            feeCents: 300,
            netCents: 9700,
            settlementPhase: "payment_received",
          },
        },
      },
      invoiceViewUrl: "https://example.com/invoice/inv_1",
      businessName: "Acme Ltd",
      businessReplyEmail: "billing@acme.com",
      issuer: sampleIssuer,
    })
    expect(html).toContain(">Payment method<")
    expect(html).toContain("4242")
    expect(html).toContain("/payment-brands/visa.png")
    expect(html).toContain(">When<")
    expect(html.indexOf(">When<")).toBeLessThan(html.indexOf(">Status<"))
    expect(html).toContain("Aug 03, 2026")
  })

  it("includes payment method and When when emailing a paid invoice", () => {
    const paidAt = "2026-08-03T04:54:00.000Z"
    const html = generateInvoiceEmailHtml({
      invoice: {
        ...sampleInvoice,
        status: "paid",
        paymentInfo: {
          paidAt,
          method: "cash",
          cashNote: "Paid in person",
        },
      },
      invoiceViewUrl: "https://example.com/invoice/inv_1",
      businessName: "Acme Ltd",
      businessReplyEmail: "billing@acme.com",
      issuer: sampleIssuer,
    })
    expect(html).toContain(">Payment method<")
    expect(html).toContain("Cash or other method")
    expect(html).toContain(">When<")
    expect(html).not.toContain(">Due<")
  })
})
