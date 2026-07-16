import { describe, expect, it } from "vitest"
import {
  toEasnerTransactionPrimaryLabel,
  toEasnerTransactionProductCategory,
} from "./product-label"
import {
  isNoahVaFundingDeposit,
  resolveNoahVaFundingDepositTitleFromMeta,
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
    expect(isNoahVaFundingDeposit({ provider: "noah", direction: "in", metadata: meta })).toBe(true)
    expect(resolveNoahVaFundingDepositTitleFromMeta(meta)).toBe("US Bank Deposit")
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
    expect(isNoahVaFundingDeposit({ provider: "noah", direction: "in", metadata: meta })).toBe(false)
  })
})
