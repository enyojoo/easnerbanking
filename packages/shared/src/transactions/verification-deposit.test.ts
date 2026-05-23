import { describe, expect, it } from "vitest"
import {
  ACCOUNT_VERIFICATION_LIST_LABEL,
  VERIFICATION_DEPOSIT_PRODUCT_LABEL,
  classifyVerificationDeposit,
  deriveVerificationBankName,
  buildVerificationDepositMetadataFields,
} from "./verification-deposit"
import { toEasnerTransactionPrimaryLabel, toEasnerTransactionProductCategory } from "./product-label"
import { buildBankDepositLifecycle } from "./bank-deposit-lifecycle"

const MICRO_PAY_IN = {
  ID: "micro-tx-1",
  Direction: "In",
  Network: "OffNetwork",
  Status: "Settled",
  FiatPayment: { Amount: "0.32", FiatCurrency: "USD" },
  FiatPaymentMethod: {
    IssuerDetails: { Name: "JPMorgan Chase Bank" },
  },
  Breakdown: [],
} as Record<string, unknown>

const FUNDING_PAY_IN = {
  ID: "fund-tx-1",
  Direction: "In",
  Network: "OffNetwork",
  Status: "Settled",
  FiatPayment: { Amount: "12", FiatCurrency: "USD" },
  Breakdown: [{ Type: "Remaining", Amount: "9.946" }],
  CryptoCurrency: "USDC",
} as Record<string, unknown>

describe("classifyVerificationDeposit", () => {
  it("classifies sub-dollar pay-in without settlement as verification", () => {
    expect(
      classifyVerificationDeposit({
        payload: MICRO_PAY_IN,
        fiatAmount: 0.32,
        settledStablecoinAmount: null,
      }),
    ).toBe("verification")
  })

  it("classifies normal deposit as funding", () => {
    expect(
      classifyVerificationDeposit({
        payload: FUNDING_PAY_IN,
        fiatAmount: 12,
        settledStablecoinAmount: 9.946,
      }),
    ).toBe("funding")
  })

  it("treats exactly $1.00 as funding", () => {
    expect(
      classifyVerificationDeposit({
        metadata: { flow: "bank_onramp", fiat_deposit_amount: 1 },
        fiatAmount: 1,
        settledStablecoinAmount: null,
      }),
    ).toBe("funding")
  })
})

describe("deriveVerificationBankName", () => {
  it("prefers IssuerDetails.Name", () => {
    expect(deriveVerificationBankName({ payload: MICRO_PAY_IN })).toBe("Jpmorgan Chase Bank")
  })
})

describe("buildVerificationDepositMetadataFields", () => {
  it("sets deposit_kind and verification_bank_name for micro pay-in", () => {
    const fields = buildVerificationDepositMetadataFields({
      payload: MICRO_PAY_IN,
      fiatAmount: 0.32,
      settledStablecoinAmount: null,
    })
    expect(fields.deposit_kind).toBe("verification")
    expect(fields.verification_bank_name).toBeTruthy()
  })
})

describe("verification labels", () => {
  it("uses account verification list title", () => {
    expect(
      toEasnerTransactionPrimaryLabel({
        provider: "noah",
        direction: "in",
        metadata: { deposit_kind: "verification" },
        payload: MICRO_PAY_IN,
      }),
    ).toBe(ACCOUNT_VERIFICATION_LIST_LABEL)
  })

  it("uses verification deposit product category", () => {
    expect(
      toEasnerTransactionProductCategory({
        provider: "noah",
        direction: "in",
        metadata: { deposit_kind: "verification" },
      }),
    ).toBe(VERIFICATION_DEPOSIT_PRODUCT_LABEL)
  })

  it("uses verification lifecycle completed copy", () => {
    const steps = buildBankDepositLifecycle({
      status: "settled",
      metadata: { deposit_kind: "verification", processing_at: "2026-01-01T00:00:00Z" },
    })
    expect(steps[1].description).toContain("not added to your balance")
    expect(steps[1].description).not.toContain("Funds are now available")
  })
})
