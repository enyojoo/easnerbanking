import { describe, expect, it } from "vitest"
import { YcPayoutError, ycPayoutClientError, ycPayoutUserMessage } from "./payout-errors"

describe("ycPayoutUserMessage", () => {
  it("never names the payout provider", () => {
    const err = new YcPayoutError(
      "YC_SEND_NO_COMPLIANT_QUANTUM",
      "internal underpay detail",
      422,
    )
    expect(err.userMessage.toLowerCase()).not.toMatch(/yellowcard|noah|grid/)
    expect(ycPayoutUserMessage("YC_SEND_UNAVAILABLE").toLowerCase()).not.toMatch(
      /yellowcard|noah|grid/,
    )
  })

  it("never returns YC_* tokens to the client", () => {
    expect(ycPayoutClientError("YC_SEND_NO_COMPLIANT_QUANTUM")).not.toMatch(/^YC_/)
    expect(ycPayoutClientError("YC_QUOTE_EXPIRED")).toMatch(/expired/i)
  })
})
