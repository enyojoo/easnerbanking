import { describe, expect, it } from "vitest"
import {
  generateCheckoutPayerReceiptEmailHtml,
  generateCheckoutPayerReceiptEmailText,
  getCheckoutPayerReceiptEmailSubject,
} from "@/lib/checkout/checkout-payer-receipt-template"

const sample = {
  customerName: "Jane Doe",
  businessName: "Acme Ltd",
  businessReplyEmail: "billing@acme.com",
  amountCents: 4900,
  currency: "USD",
  description: "Pro plan",
  paidAt: "2026-08-03T04:54:00.000Z",
  timeZone: "UTC",
}

describe("checkout payer receipt template", () => {
  it("uses Receipt from {business} as the subject", () => {
    expect(getCheckoutPayerReceiptEmailSubject("Acme Ltd")).toBe("Receipt from Acme Ltd")
  })

  it("renders HTML with Easner shell, amount, and payment description", () => {
    const html = generateCheckoutPayerReceiptEmailHtml(sample)
    expect(html).toContain("Easner%20Logo.png")
    expect(html).toContain("Dear Jane Doe")
    expect(html).toContain("Thank you")
    expect(html).toContain("payment to Acme Ltd")
    expect(html).toContain("$49.00 USD")
    expect(html).toContain("Pro plan")
    expect(html).toContain("Paid")
    expect(html).toContain("Aug 03, 2026 • 4:54 AM")
    expect(html).toContain(
      "You're receiving this email because Acme Ltd uses Easner Business Banking services",
    )
    expect(html).toContain("If you have any questions about this payment, email")
    expect(html).toContain("billing@acme.com")
    expect(html).toContain("Easner Group, Inc.")
    expect(html).not.toContain('<h1 class="email-title">')
  })

  it("falls back to Online payment when the description is empty", () => {
    const html = generateCheckoutPayerReceiptEmailHtml({ ...sample, description: "  " })
    expect(html).toContain("Online payment")
  })

  it("renders a matching text body", () => {
    const text = generateCheckoutPayerReceiptEmailText(sample)
    expect(text).toContain("Dear Jane Doe")
    expect(text).toContain("payment to Acme Ltd")
    expect(text).toContain("$49.00 USD")
    expect(text).toContain("Paid for: Pro plan")
    expect(text).toContain("When: Aug 03, 2026 • 4:54 AM")
    expect(text).toContain("Status: Paid")
    expect(text).toContain("billing@acme.com")
  })

  it("formats When in the receipt timezone and includes the card used", () => {
    const paid = {
      ...sample,
      paidAt: "2026-08-18T23:00:37.000Z",
      timeZone: "Asia/Jerusalem",
      paymentMethod: { type: "card", brand: "visa", last4: "0736" },
    }
    const html = generateCheckoutPayerReceiptEmailHtml(paid)
    const text = generateCheckoutPayerReceiptEmailText(paid)
    expect(html).toContain("Aug 19, 2026 • 2:00 AM")
    expect(html).toContain("Payment method")
    expect(html).toContain("•••• 0736")
    expect(html).toContain("/payment-brands/visa.png")
    expect(text).toContain("When: Aug 19, 2026 • 2:00 AM")
    expect(text).toContain("Payment method: Visa •••• 0736")
  })
})
