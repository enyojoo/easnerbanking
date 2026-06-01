import { describe, expect, it, vi } from "vitest"

vi.mock("@easner/shared", () => ({
  isBankOnrampDepositFlow: (meta: Record<string, unknown>) =>
    String(meta?.flow ?? "").toLowerCase() === "bank_onramp",
  isVerificationDepositMetadata: (meta: Record<string, unknown>) =>
    String(meta?.deposit_kind ?? "").toLowerCase() === "verification",
}))

import { shouldDeferBankDepositSettledPush } from "../bank-deposit-settled-notify"

describe("shouldDeferBankDepositSettledPush", () => {
  it("defers funding bank on-ramp deposits", () => {
    expect(
      shouldDeferBankDepositSettledPush({
        flow: "bank_onramp",
        deposit_kind: "funding",
      }),
    ).toBe(true)
  })

  it("does not defer verification microdeposits", () => {
    expect(
      shouldDeferBankDepositSettledPush({
        flow: "bank_onramp",
        deposit_kind: "verification",
      }),
    ).toBe(false)
  })

  it("does not defer global payouts", () => {
    expect(
      shouldDeferBankDepositSettledPush({
        payout_type: "global_fiat",
        flow: "global_fiat_offramp",
      }),
    ).toBe(false)
  })
})
