import { describe, expect, it } from "vitest"
import { resolvePaymentDisplay } from "@/lib/invoices/resolve-payment-display"
import type { InvoicePayInPayload } from "@/lib/invoices/resolve-pay-in-for-business"

const bankOnly: InvoicePayInPayload = {
  bankAccount: {
    id: "b1",
    currency: "USD",
    accountNumber: "123",
    routingNumber: "456",
    bankName: "Test",
    accountHolderName: "Biz",
    balance: 0,
  },
}

const stableOnly: InvoicePayInPayload = {
  stablecoinAccount: {
    currency: "USD",
    stablecoin: "USDC",
    chain: "ethereum",
    address: "0xabc",
  },
}

const both: InvoicePayInPayload = { ...bankOnly, ...stableOnly }

describe("resolvePaymentDisplay", () => {
  it("respects per-invoice overrides", () => {
    const d = resolvePaymentDisplay({
      invoice: {
        paymentDisplay: { showBank: false, showStablecoin: true },
        status: "open",
      },
      payIn: both,
    })
    expect(d.showBank).toBe(false)
    expect(d.showStablecoin).toBe(true)
  })

  it("falls back to at least one method when both would be hidden", () => {
    const d = resolvePaymentDisplay({
      invoice: {
        paymentDisplay: { showBank: false, showStablecoin: false },
        status: "open",
      },
      businessDefaults: { showBankTransfer: false, showStablecoin: false },
      payIn: bankOnly,
    })
    expect(d.showBank).toBe(true)
  })

  it("hides all when not payable", () => {
    const d = resolvePaymentDisplay({
      invoice: { status: "draft" },
      payIn: both,
      payable: false,
    })
    expect(d.showBank).toBe(false)
    expect(d.showStablecoin).toBe(false)
    expect(d.showOnlinePayment).toBe(false)
  })

  it("shows online when Stripe enabled", () => {
    const d = resolvePaymentDisplay({
      invoice: { status: "open" },
      payIn: both,
      stripeOnlineEnabled: true,
    })
    expect(d.showOnlinePayment).toBe(true)
    expect(d.defaultTab).toBe("online")
  })

  it("uses stablecoin default tab when preferred", () => {
    const d = resolvePaymentDisplay({
      invoice: { status: "open" },
      businessDefaults: { preferredMethod: "stablecoin" },
      payIn: both,
    })
    expect(d.defaultTab).toBe("stablecoin")
  })
})
