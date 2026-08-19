import { describe, expect, it } from "vitest"
import { payoutQuoteEconomicsKey, type PayoutQuoteStashMeta } from "./payout-quote-cache"

const base: PayoutQuoteStashMeta = {
  recipientId: "rec-1",
  amountEntryMode: "receive",
  entryAmount: 2000,
  receiveCurrency: "NGN",
  sourceBalanceCurrency: "USD",
}

describe("payoutQuoteEconomicsKey", () => {
  it("ignores note and payment purpose so typing a reference does not restart a lock", () => {
    expect(
      payoutQuoteEconomicsKey({ ...base, note: "rent", paymentPurpose: "goods" }),
    ).toBe(payoutQuoteEconomicsKey({ ...base, note: "salary", paymentPurpose: "services" }))
  })

  it("changes when amount or recipient changes", () => {
    expect(payoutQuoteEconomicsKey({ ...base, entryAmount: 2001 })).not.toBe(
      payoutQuoteEconomicsKey(base),
    )
    expect(payoutQuoteEconomicsKey({ ...base, recipientId: "rec-2" })).not.toBe(
      payoutQuoteEconomicsKey(base),
    )
  })
})
