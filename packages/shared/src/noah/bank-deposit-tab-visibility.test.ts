import { describe, expect, it } from "vitest"
import { isVaAnswerSettled, shouldShowBankDepositTab } from "./bank-deposit-tab-visibility"

describe("isVaAnswerSettled", () => {
  it("is settled when fetch completed", () => {
    expect(isVaAnswerSettled({ isFetched: true, hasCachedEntry: false })).toBe(true)
  })

  it("is settled when cached entry exists before fetch", () => {
    expect(isVaAnswerSettled({ isFetched: false, hasCachedEntry: true })).toBe(true)
  })

  it("is not settled when neither fetched nor cached", () => {
    expect(isVaAnswerSettled({ isFetched: false, hasCachedEntry: false })).toBe(false)
  })
})

describe("shouldShowBankDepositTab", () => {
  it("shows bank tab when verification is not complete", () => {
    expect(
      shouldShowBankDepositTab({
        verificationComplete: false,
        vaSettled: false,
        hasVirtualAccount: false,
      }),
    ).toBe(true)
  })

  it("hides bank tab when verified and VA answer is not settled", () => {
    expect(
      shouldShowBankDepositTab({
        verificationComplete: true,
        vaSettled: false,
        hasVirtualAccount: false,
      }),
    ).toBe(false)
  })

  it("hides bank tab when verified, settled, and no VA", () => {
    expect(
      shouldShowBankDepositTab({
        verificationComplete: true,
        vaSettled: true,
        hasVirtualAccount: false,
      }),
    ).toBe(false)
  })

  it("shows bank tab when verified, settled, and VA exists", () => {
    expect(
      shouldShowBankDepositTab({
        verificationComplete: true,
        vaSettled: true,
        hasVirtualAccount: true,
      }),
    ).toBe(true)
  })

  it("shows bank tab from cached positive VA before fetch completes", () => {
    expect(
      shouldShowBankDepositTab({
        verificationComplete: true,
        vaSettled: isVaAnswerSettled({ isFetched: false, hasCachedEntry: true }),
        hasVirtualAccount: true,
      }),
    ).toBe(true)
  })

  it("hides bank tab from cached negative VA on rehydrate", () => {
    expect(
      shouldShowBankDepositTab({
        verificationComplete: true,
        vaSettled: isVaAnswerSettled({ isFetched: false, hasCachedEntry: true }),
        hasVirtualAccount: false,
      }),
    ).toBe(false)
  })
})
