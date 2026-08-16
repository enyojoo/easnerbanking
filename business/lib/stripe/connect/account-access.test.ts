import { describe, expect, it } from "vitest"
import { isStripeConnectAccountInaccessibleError } from "./account-access"

describe("isStripeConnectAccountInaccessibleError", () => {
  it("detects Stripe account_invalid", () => {
    expect(
      isStripeConnectAccountInaccessibleError({
        code: "account_invalid",
        message: "The provided key does not have access to account 'acct_1U4gjRCQrcxsxfcP'",
      }),
    ).toBe(true)
  })

  it("ignores unrelated Stripe errors", () => {
    expect(
      isStripeConnectAccountInaccessibleError({
        code: "rate_limit",
        message: "Too many requests",
      }),
    ).toBe(false)
  })
})
