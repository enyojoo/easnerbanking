import { describe, expect, it } from "vitest"
import {
  buildCheckoutSessionMetadata,
  parseCheckoutSessionMetadata,
  settlesAsCollection,
} from "./checkout-session-metadata"

const BASE = {
  settlementId: "11111111-1111-4111-8111-111111111111",
  businessId: "22222222-2222-4222-8222-222222222222",
  connectedAccountId: "acct_123",
  feeMode: "merchant_net" as const,
  listedAmountCents: 10_000,
}

describe("checkout session metadata", () => {
  it("round-trips an invoice session", () => {
    const metadata = buildCheckoutSessionMetadata({
      ...BASE,
      source: "invoice",
      invoiceId: "33333333-3333-4333-8333-333333333333",
      invoiceNumber: "EINV-1042",
    })

    const parsed = parseCheckoutSessionMetadata(metadata)
    expect(parsed.source).toBe("invoice")
    expect(parsed.invoiceNumber).toBe("EINV-1042")
    expect(parsed.paymentLinkId).toBeNull()
    expect(parsed.feeMode).toBe("merchant_net")
    expect(parsed.listedAmountCents).toBe(10_000)
    expect(settlesAsCollection(parsed.source)).toBe(false)
  })

  it("routes payment links and embeds to the collection handler", () => {
    const link = parseCheckoutSessionMetadata(
      buildCheckoutSessionMetadata({
        ...BASE,
        source: "payment_link",
        feeMode: "buyer_surcharge",
        paymentLinkId: "44444444-4444-4444-8444-444444444444",
      }),
    )
    expect(link.source).toBe("payment_link")
    expect(link.paymentLinkId).toBe("44444444-4444-4444-8444-444444444444")
    expect(link.feeMode).toBe("buyer_surcharge")
    expect(settlesAsCollection(link.source)).toBe(true)

    const embed = parseCheckoutSessionMetadata(
      buildCheckoutSessionMetadata({ ...BASE, source: "embed" }),
    )
    expect(settlesAsCollection(embed.source)).toBe(true)
  })

  it("falls back to invoice for missing or unknown sources", () => {
    expect(parseCheckoutSessionMetadata({}).source).toBe("invoice")
    expect(parseCheckoutSessionMetadata({ easner_checkout_source: "terminal" }).source).toBe("invoice")
  })

  it("ignores a fee mode it does not recognise", () => {
    const parsed = parseCheckoutSessionMetadata({ easner_fee_mode: "buyer_pays_everything" })
    expect(parsed.feeMode).toBeNull()
    expect(parsed.listedAmountCents).toBeNull()
  })

  it("lets callers add their own keys without dropping the easner contract", () => {
    const metadata = buildCheckoutSessionMetadata({
      ...BASE,
      source: "embed",
      extra: { merchant_order_id: "ord_99" },
    })

    expect(metadata.merchant_order_id).toBe("ord_99")
    expect(parseCheckoutSessionMetadata(metadata).settlementId).toBe(BASE.settlementId)
  })
})

describe("reserved metadata protection", () => {
  it("never lets extra overwrite routing keys", () => {
    const metadata = buildCheckoutSessionMetadata({
      ...BASE,
      source: "embed",
      extra: {
        easner_business_id: "spoofed",
        easner_checkout_source: "invoice",
        easner_settlement_id: "spoofed",
        easner_invoice_id: "spoofed",
        order_id: "1234",
      },
    })
    expect(metadata.easner_business_id).toBe(BASE.businessId)
    expect(metadata.easner_checkout_source).toBe("embed")
    expect(metadata.easner_settlement_id).toBe(BASE.settlementId)
    expect(metadata.easner_invoice_id).toBeUndefined()
    expect(metadata.order_id).toBe("1234")
  })

  it("keeps easner_livemode from the session creator", () => {
    const metadata = buildCheckoutSessionMetadata({
      ...BASE,
      source: "embed",
      extra: { easner_livemode: "false" },
    })
    expect(metadata.easner_livemode).toBe("false")
  })
})
