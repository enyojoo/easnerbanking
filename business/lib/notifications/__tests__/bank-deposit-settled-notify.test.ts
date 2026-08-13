import { describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))
vi.mock("@/lib/notifications/dispatch", () => ({
  dispatchTransactionNotification: vi.fn(),
}))

vi.mock("@easner/shared", () => ({
  isBankOnrampDepositFlow: (meta: Record<string, unknown>) =>
    String(meta?.flow ?? "").toLowerCase() === "bank_onramp",
  isVerificationDepositMetadata: (meta: Record<string, unknown>) =>
    String(meta?.deposit_kind ?? "").toLowerCase() === "verification",
  isYcFundBalanceDepositMetadata: (meta: Record<string, unknown>) =>
    meta?.yc_mode === "fund_balance",
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

  it("defers Grid VA inbound bank deposits until on-chain settlement", () => {
    expect(
      shouldDeferBankDepositSettledPush({
        flow: "bank_onramp",
        payout_provider: "grid",
        grid_va_inbound: true,
        deposit_kind: "funding",
      }),
    ).toBe(true)
  })

  it("defers YC fund balance pay-in until on-chain vault settlement", () => {
    expect(
      shouldDeferBankDepositSettledPush({
        flow: "bank_onramp",
        yc_mode: "fund_balance",
        deposit_kind: "funding",
      }),
    ).toBe(true)
  })
})
