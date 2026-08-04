import { describe, expect, it } from "vitest"
import {
  customerPaymentOptionsSubtitle,
  emailPaymentContextParagraph,
  emailPrimaryCtaText,
} from "@/lib/invoices/invoice-payment-copy"

describe("invoice-payment-copy", () => {
  it("builds subtitle for all three rails", () => {
    const text = customerPaymentOptionsSubtitle("EINV-42", {
      hasOnline: true,
      hasBank: true,
      hasStablecoin: true,
    })
    expect(text).toContain("EINV-42")
    expect(text).toContain("Pay online")
    expect(text).toContain("stablecoin")
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
