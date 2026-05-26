import { describe, expect, it } from "vitest"
import {
  VERIFICATION_DEPOSIT_LIST_LABEL,
  VERIFICATION_DEPOSIT_PRODUCT_LABEL,
  classifyVerificationDeposit,
  classifyVerificationDepositFromFiatDeposit,
  deriveVerificationBankName,
  deriveVerificationDepositNarrationLabel,
  buildVerificationDepositMetadataFields,
  formatVerificationBankDisplayName,
  formatVerificationDepositPushBody,
} from "./verification-deposit"
import { toEasnerTransactionPrimaryLabel, toEasnerTransactionProductCategory } from "./product-label"
import { buildBankDepositLifecycle } from "./bank-deposit-lifecycle"
import { resolveInboundTransactionListLabel } from "./transaction-list-label"

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

const FIAT_DEPOSIT_MICRO = {
  ID: "4e821cbc-7fa6-590a-909a-650306f1d64f",
  Sender: { FullName: "PNCBANK_XTRANSFR" },
  Status: "Settled",
  FiatAmount: "0.2",
  FiatCurrency: "USD",
  Reference: "ACH Credit 063106148847119 PNCBANK_XTRANSFR ACCTVERIFY",
  PaymentMethodType: "BankAch",
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

describe("formatVerificationBankDisplayName", () => {
  it("formats PNCBANK_XTRANSFR as PNC Bank", () => {
    expect(formatVerificationBankDisplayName("PNCBANK_XTRANSFR")).toBe("PNC Bank")
  })

  it("formats TDBANK as TD Bank", () => {
    expect(formatVerificationBankDisplayName("TDBANK")).toBe("TD Bank")
  })

  it("formats spaced PNC BANK as PNC Bank", () => {
    expect(formatVerificationBankDisplayName("PNC BANK")).toBe("PNC Bank")
  })

  it("title-cases full issuer names", () => {
    expect(formatVerificationBankDisplayName("JPMORGAN CHASE BANK")).toBe("Jpmorgan Chase Bank")
  })

  it("returns fallback for empty input", () => {
    expect(formatVerificationBankDisplayName("")).toBe("Your bank")
  })
})

describe("formatVerificationDepositPushBody", () => {
  it("builds short push copy", () => {
    expect(
      formatVerificationDepositPushBody({
        amount: 0.2,
        currency: "USD",
        bankName: "PNC Bank",
      }),
    ).toBe("Received $0.20 from PNC Bank")
  })
})

describe("classifyVerificationDepositFromFiatDeposit", () => {
  it("classifies sub-dollar as verification", () => {
    expect(classifyVerificationDepositFromFiatDeposit({ fiatAmount: 0.34 })).toBe("verification")
  })

  it("classifies $1+ as funding", () => {
    expect(classifyVerificationDepositFromFiatDeposit({ fiatAmount: 1 })).toBe("funding")
  })
})

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

  it("classifies FiatDeposit webhook payload as verification", () => {
    expect(
      classifyVerificationDeposit({
        payload: FIAT_DEPOSIT_MICRO,
        fiatAmount: 0.2,
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

describe("deriveVerificationDepositNarrationLabel", () => {
  it("parses Sent from in ACH reference when present", () => {
    expect(
      deriveVerificationDepositNarrationLabel({
        paymentReference: ACH_REF,
      }),
    ).toBe("Sent from Grey")
  })

  it("falls back to Sent from formatted bank for ACCTVERIFY lines", () => {
    expect(
      deriveVerificationDepositNarrationLabel({
        paymentReference: FIAT_DEPOSIT_MICRO.Reference as string,
        verificationBankName: "PNC Bank",
        fiatDepositSenderName: "PNCBANK_XTRANSFR",
      }),
    ).toBe("Sent from PNC Bank")
  })

  it("prefers stored deposit_narration in metadata", () => {
    expect(
      deriveVerificationDepositNarrationLabel({
        metadata: { deposit_narration: "Sent from Chase" },
        paymentReference: FIAT_DEPOSIT_MICRO.Reference as string,
      }),
    ).toBe("Sent from Chase")
  })
})

const ACH_REF =
  "ACH Credit 026073154040278 Samuel Odiba Sent from Sent from Grey"

describe("deriveVerificationBankName", () => {
  it("formats FiatDeposit sender", () => {
    expect(deriveVerificationBankName({ payload: FIAT_DEPOSIT_MICRO })).toBe("PNC Bank")
  })

  it("prefers IssuerDetails.Name on Transaction payload", () => {
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
  it("uses bank verification deposit list title", () => {
    expect(
      toEasnerTransactionPrimaryLabel({
        provider: "noah",
        direction: "in",
        metadata: { deposit_kind: "verification" },
        payload: MICRO_PAY_IN,
      }),
    ).toBe(VERIFICATION_DEPOSIT_LIST_LABEL)
  })

  it("resolveInboundTransactionListLabel returns bank verification deposit", () => {
    expect(
      resolveInboundTransactionListLabel({
        metadata: { deposit_kind: "verification" },
      }),
    ).toBe(VERIFICATION_DEPOSIT_LIST_LABEL)
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
