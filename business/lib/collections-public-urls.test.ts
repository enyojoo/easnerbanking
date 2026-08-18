import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { buildInvoiceCustomerUrl } from "./invoice-public-url"
import { buildPaymentLinkUrl, buildStablecoinChargeUrl, buildPaymentThanksUrl } from "./payment-links/public-url"

const LINK = { id: "550e8400-e29b-41d4-a716-446655440000", slug: "tuition-fall" }
const SESSION_ID = "6ba7b810-9dad-41d1-80b4-00c04fd430c8"
const INVOICE = { id: "77777777-7777-4777-8777-777777777777", invoiceNumber: "EINV-1042" }

describe("collections public URLs", () => {
  const saved = {
    invoice: process.env.NEXT_PUBLIC_INVOICE_APP_URL,
    pay: process.env.NEXT_PUBLIC_PAY_APP_URL,
  }

  beforeEach(() => {
    delete process.env.NEXT_PUBLIC_INVOICE_APP_URL
    delete process.env.NEXT_PUBLIC_PAY_APP_URL
  })

  afterEach(() => {
    if (saved.invoice) process.env.NEXT_PUBLIC_INVOICE_APP_URL = saved.invoice
    if (saved.pay) process.env.NEXT_PUBLIC_PAY_APP_URL = saved.pay
  })

  it("puts invoices on invoice.easner.com without the internal /invoice prefix", () => {
    expect(buildInvoiceCustomerUrl("acme", INVOICE)).toBe("https://invoice.easner.com/acme/einv-1042")
  })

  it("falls back to the invoice id when the business has no easetag", () => {
    expect(buildInvoiceCustomerUrl(null, INVOICE)).toBe(
      `https://invoice.easner.com/${INVOICE.id}`,
    )
  })

  it("uses the two-segment payment link URL when an easetag is set", () => {
    expect(buildPaymentLinkUrl("@Acme", LINK)).toBe("https://pay.easner.com/acme/tuition-fall")
  })

  it("uses the typed plink_ id when there is no easetag", () => {
    expect(buildPaymentLinkUrl(null, LINK)).toBe(
      "https://pay.easner.com/plink_550e8400e29b41d4a716446655440000",
    )
  })

  it("shares stablecoin charges under the same host", () => {
    expect(buildStablecoinChargeUrl("acme", SESSION_ID)).toBe(
      `https://pay.easner.com/acme/${SESSION_ID}`,
    )
    expect(buildStablecoinChargeUrl(null, SESSION_ID)).toBe(`https://pay.easner.com/${SESSION_ID}`)
  })

  it("respects host overrides from the environment", () => {
    process.env.NEXT_PUBLIC_PAY_APP_URL = "http://localhost:3000/"
    expect(buildPaymentThanksUrl()).toBe("http://localhost:3000/thanks")
  })
})
