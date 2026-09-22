import { describe, expect, it } from "vitest"
import {
  toEasnerTransactionPrimaryLabel,
  toEasnerTransactionProductCategory,
} from "./product-label"
import {
  isVaFundingDeposit,
  resolveVaFundingDepositTitleFromMeta,
} from "./yc-deposit-display"

describe("product labels for deposits", () => {
  it("YC fund_balance uses country deposit title", () => {
    const meta = {
      yc_mode: "fund_balance",
      flow: "bank_onramp",
      deposit_display_title: "Nigeria MOMO Deposit",
      local_currency: "NGN",
      pay_in_rail: "mobile_money",
      residence_country: "NG",
    }
    expect(
      toEasnerTransactionPrimaryLabel({
        provider: "yellowcard",
        direction: "in",
        metadata: meta,
      }),
    ).toBe("Nigeria MOMO Deposit")
  })

  it("Noah USD VA funding → US Bank Deposit", () => {
    const meta = { flow: "bank_onramp", fiat_deposit_currency: "USD" }
    expect(
      toEasnerTransactionProductCategory({
        provider: "noah",
        direction: "in",
        metadata: meta,
      }),
    ).toBe("US Bank Deposit")
    expect(isVaFundingDeposit({ provider: "noah", direction: "in", metadata: meta })).toBe(true)
    expect(isVaFundingDeposit({ provider: "grid", direction: "in", metadata: meta })).toBe(true)
    expect(resolveVaFundingDepositTitleFromMeta(meta)).toBe("US Bank Deposit")
  })

  it("verification deposit keeps existing label", () => {
    const meta = { flow: "bank_onramp", deposit_kind: "verification", fiat_deposit_currency: "USD" }
    expect(
      toEasnerTransactionPrimaryLabel({
        provider: "noah",
        direction: "in",
        metadata: meta,
      }),
    ).toBe("Bank verification deposit")
    expect(isVaFundingDeposit({ provider: "noah", direction: "in", metadata: meta })).toBe(false)
  })

  it("Express deposits uses method label, not invoice copy", () => {
    expect(
      toEasnerTransactionPrimaryLabel({
        provider: "stripe",
        direction: "in",
        metadata: { flow: "express_deposits", payment_method: "card" },
      }),
    ).toBe("Card deposit")
    expect(
      toEasnerTransactionProductCategory({
        provider: "stripe",
        direction: "in",
        metadata: { flow: "express_deposits", payment_method: "apple_pay" },
      }),
    ).toBe("Apple Pay deposit")
  })

  it("fee-wallet revenue sweep → Payout fee, not Stablecoin Deposit", () => {
    expect(
      toEasnerTransactionPrimaryLabel({
        provider: "turnkey",
        direction: "in",
        metadata: { fee_wallet_revenue_sweep: true },
      }),
    ).toBe("Payout fee")
    expect(
      toEasnerTransactionProductCategory({
        provider: "turnkey",
        direction: "in",
        metadata: { org_treasury_kind: "pay_in_fee" },
      }),
    ).toBe("Pay in fee")
  })

  it("Stripe invoice settlement → Invoice #number (not Bank Deposit)", () => {
    const meta = {
      source: "invoice_stripe",
      invoice_id: "775370a7-d508-4812-8488-ea59d938a9b2",
      invoice_number: "EINV-C792A19D610A",
      settlement_phase: "payment_received",
    }
    expect(
      toEasnerTransactionPrimaryLabel({
        provider: "stripe",
        direction: "in",
        metadata: meta,
      }),
    ).toBe("Invoice #EINV-C792A19D610A")
    expect(
      toEasnerTransactionProductCategory({
        provider: "stripe",
        direction: "in",
        metadata: meta,
      }),
    ).toBe("Invoice payment")
  })
})
