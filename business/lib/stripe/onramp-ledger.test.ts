import { describe, expect, it } from "vitest"
import { readStripeOnrampTxHash } from "./onramp-session-tx-hash"

describe("readStripeOnrampTxHash", () => {
  it("reads transaction_details.transaction_id", () => {
    expect(
      readStripeOnrampTxHash({
        transaction_details: {
          transaction_id: "5YNw9aZ2A6sqFgXU3oGtYTn9D411LjsaGeUxyxq7hDfDyRm4ErvD2ufczzW1eyYadLboHr1YXWeLx3EKxxwgeq1J",
        },
      }),
    ).toBe("5YNw9aZ2A6sqFgXU3oGtYTn9D411LjsaGeUxyxq7hDfDyRm4ErvD2ufczzW1eyYadLboHr1YXWeLx3EKxxwgeq1J")
  })
})
