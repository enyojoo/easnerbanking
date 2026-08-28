import { describe, expect, it } from "vitest"
import {
  gridVaMatchesBankAccount,
  isDuplicateBankAccountError,
  last4Digits,
  pickCanonicalGridVaBank,
  routingNumbersMatch,
  stripeVaLinkIdempotencyKey,
  vaPayoutFingerprint,
} from "./grid-va-bank-match"

describe("grid VA bank matching", () => {
  it("strips non-digits so dashed routing still matches", () => {
    expect(routingNumbersMatch("021214891", "021-214-891")).toBe(true)
    expect(last4Digits("021-214-891")).toBe("4891")
  })

  it("matches USD Grid VA against Stripe last4 + routing", () => {
    expect(
      gridVaMatchesBankAccount(
        { accountNumber: "1234567890", routingNumber: "021214891" },
        "usd",
        { last4: "7890", routing_number: "021214891" },
      ),
    ).toBe(true)
  })

  it("does not match a different account last4", () => {
    expect(
      gridVaMatchesBankAccount(
        { accountNumber: "1234567890", routingNumber: "021214891" },
        "usd",
        { last4: "0001", routing_number: "021214891" },
      ),
    ).toBe(false)
  })

  it("prefers the stored bank when the same VA was linked twice", () => {
    const picked = pickCanonicalGridVaBank(
      [
        { id: "ba_first", default_for_currency: false },
        { id: "ba_second", default_for_currency: true },
      ],
      "ba_first",
    )
    expect(picked?.id).toBe("ba_first")
  })

  it("prefers the default bank when nothing is stored", () => {
    const picked = pickCanonicalGridVaBank([
      { id: "ba_first", default_for_currency: false },
      { id: "ba_second", default_for_currency: true },
    ])
    expect(picked?.id).toBe("ba_second")
  })

  it("builds a stable Stripe idempotency key from VA details", () => {
    const fingerprint = vaPayoutFingerprint("usd", {
      accountNumber: "1234567890",
      routingNumber: "021214891",
    })
    expect(stripeVaLinkIdempotencyKey("biz_1", "USD", fingerprint)).toBe(
      "connect_va_biz_1_usd_usd_1234567890_021214891",
    )
  })

  it("detects Stripe duplicate bank errors", () => {
    expect(isDuplicateBankAccountError({ code: "bank_account_exists", message: "exists" })).toBe(true)
    expect(isDuplicateBankAccountError(new Error("This bank account already exists"))).toBe(true)
    expect(isDuplicateBankAccountError(new Error("card declined"))).toBe(false)
  })
})
