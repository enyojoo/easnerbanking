import { describe, expect, it } from "vitest"
import type { Invoice } from "@/lib/b2b/types"
import { resolveInvoiceEmailPaymentMethod } from "@/lib/invoices/invoice-email-payment-method"

const paidStripeInvoice: Invoice = {
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
  status: "paid",
  createdDate: "2026-01-01T00:00:00.000Z",
  finalizedDate: "2026-01-01T00:00:00.000Z",
  dueDate: "2026-02-01",
  frequency: null,
  lineItems: [{ description: "Service", quantity: 1, unitPrice: 100, amount: 100 }],
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
      settlementPhase: "payment_received",
    },
  },
}

describe("resolveInvoiceEmailPaymentMethod", () => {
  it("returns PNG chip + mask for Stripe card payments", () => {
    const resolved = resolveInvoiceEmailPaymentMethod(paidStripeInvoice)
    expect(resolved).not.toBeNull()
    expect(resolved!.brandIconSrc).toMatch(/^data:image\/png;base64,/)
    expect(resolved!.htmlText).toContain("4242")
    expect(resolved!.htmlText).not.toMatch(/visa/i)
    expect(resolved!.plainText).toMatch(/visa/i)
    expect(resolved!.plainText).toContain("4242")
  })

  it("returns plain labels for cash payments", () => {
    const resolved = resolveInvoiceEmailPaymentMethod({
      ...paidStripeInvoice,
      paymentInfo: {
        paidAt: "2026-08-03T04:54:00.000Z",
        method: "cash",
      },
    })
    expect(resolved).toEqual({
      plainText: "Cash or other method",
      htmlText: "Cash or other method",
    })
  })
})
