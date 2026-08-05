import { describe, expect, it } from "vitest"
import {
  countPaymentMethods,
  customerPaymentChooserSubtitle,
  customerPaymentDisplaySubtitle,
  customerPaymentDisplayTitle,
  customerPaymentMethodTitle,
  customerPaymentSectionTitle,
  customerPaymentTabHint,
  customerSingleMethodSubtitle,
  emailPaymentContextParagraph,
  emailPrimaryCtaText,
  onlinePaymentTabHint,
  pdfPaymentSectionLines,
} from "@/lib/invoices/invoice-payment-copy"

describe("invoice-payment-copy", () => {
  it("counts enabled payment methods", () => {
    expect(
      countPaymentMethods({ hasOnline: true, hasBank: true, hasStablecoin: false }),
    ).toBe(2)
    expect(
      countPaymentMethods({ hasOnline: true, hasBank: false, hasStablecoin: false }),
    ).toBe(1)
  })

  it("uses Payment options title only when multiple methods are available", () => {
    expect(
      customerPaymentSectionTitle({
        hasOnline: true,
        hasBank: true,
        hasStablecoin: false,
      }),
    ).toBe("Payment options")
    expect(
      customerPaymentSectionTitle({
        hasOnline: true,
        hasBank: false,
        hasStablecoin: false,
      }),
    ).toBeNull()
  })

  it("uses method titles and online-only hint for single-method views", () => {
    expect(customerPaymentMethodTitle("online")).toBe("Pay online")
    expect(customerPaymentMethodTitle("bank")).toBe("Bank transfer")
    expect(customerSingleMethodSubtitle("online", "EINV-42")).toBe(onlinePaymentTabHint())
    expect(customerSingleMethodSubtitle("bank", "EINV-42")).toContain("EINV-42")
  })

  it("uses chooser subtitle for multi-method views", () => {
    expect(
      customerPaymentChooserSubtitle({
        hasOnline: true,
        hasBank: true,
        hasStablecoin: true,
      }),
    ).toBe("Choose how to pay this invoice.")
    expect(
      customerPaymentDisplaySubtitle("EINV-42", {
        hasOnline: true,
        hasBank: true,
        hasStablecoin: false,
      }),
    ).toBe("Choose how to pay this invoice.")
  })

  it("resolves display title for single and multi method", () => {
    expect(
      customerPaymentDisplayTitle({
        hasOnline: true,
        hasBank: false,
        hasStablecoin: false,
      }),
    ).toBe("Pay online")
    expect(
      customerPaymentDisplayTitle({
        hasOnline: true,
        hasBank: true,
        hasStablecoin: false,
      }),
    ).toBe("Payment options")
  })

  it("builds per-tab hints for multi-method tabs", () => {
    expect(customerPaymentTabHint("online", "EINV-42")).toBe(onlinePaymentTabHint())
    expect(customerPaymentTabHint("bank", "EINV-42")).toContain("EINV-42")
    expect(customerPaymentTabHint("stablecoin", "EINV-42")).toContain("token and network")
  })

  it("builds PDF intro for single online method", () => {
    const lines = pdfPaymentSectionLines(
      { invoiceNumber: "EINV-42", total: 100, currency: "USD" },
      {
        url: "https://example.com/invoice",
        hasOnline: true,
        hasBank: false,
        hasStablecoin: false,
      },
    )
    expect(lines[0]).toContain("card, bank debit")
    expect(lines.join("\n")).not.toContain("For bank transfers")
  })

  it("builds email payment paragraph", () => {
    expect(
      emailPaymentContextParagraph({
        hasOnline: true,
        hasBank: true,
        hasStablecoin: false,
      }),
    ).toContain("pay online")
    expect(
      emailPaymentContextParagraph({
        hasOnline: true,
        hasBank: true,
        hasStablecoin: false,
      }),
    ).toContain("bank transfer")
  })

  it("uses pay CTA when payable with methods", () => {
    expect(
      emailPrimaryCtaText(
        "sent",
        { hasOnline: true, hasBank: false, hasStablecoin: false },
        true,
      ),
    ).toBe("View & pay invoice")
    expect(
      emailPrimaryCtaText(
        "paid",
        { hasOnline: true, hasBank: false, hasStablecoin: false },
        true,
      ),
    ).toBe("View invoice")
  })
})
