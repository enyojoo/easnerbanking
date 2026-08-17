import { describe, expect, it } from "vitest"
import {
  enrichGridUsdVirtualAccountDisplay,
  enrichGridUsdVirtualAccountPersistFields,
} from "./enrich-grid-va-display"
import { GRID_USD_SPONSOR_BANK } from "./usd-sponsor-bank"

describe("enrichGridUsdVirtualAccountDisplay", () => {
  it("enriches Grid USD display with sponsor bank and business holder name", () => {
    const result = enrichGridUsdVirtualAccountDisplay(
      {
        hasAccount: true,
        currency: "usd",
        accountNumber: "355907319121",
        routingNumber: "021214891",
        status: "active",
      },
      { provider: "grid", currency: "usd", accountHolderNameFallback: "Easner Group, Inc" },
    )

    expect(result.provider).toBe("grid")
    expect(result.bankName).toBe(GRID_USD_SPONSOR_BANK.bankName)
    expect(result.bankAddress).toBe(GRID_USD_SPONSOR_BANK.bankAddress)
    expect(result.accountHolderName).toBe("Easner Group, Inc")
    expect(result.bic).toBeUndefined()
  })

  it("leaves Noah USD display unchanged", () => {
    const display = {
      hasAccount: true,
      currency: "usd" as const,
      accountNumber: "433963264657",
      routingNumber: "043087080",
      bankName: "SSB Bank",
      status: "active",
    }
    expect(
      enrichGridUsdVirtualAccountDisplay(display, {
        provider: "noah",
        currency: "usd",
        accountHolderNameFallback: "Easner Group, Inc",
      }),
    ).toEqual(display)
  })

  it("preserves existing Grid bank name when present", () => {
    const result = enrichGridUsdVirtualAccountDisplay(
      {
        hasAccount: true,
        currency: "usd",
        bankName: "Existing Bank",
        status: "active",
      },
      { provider: "grid", currency: "usd" },
    )
    expect(result.bankName).toBe("Existing Bank")
  })
})

describe("enrichGridUsdVirtualAccountPersistFields", () => {
  it("fills null Grid USD persist fields from sponsor bank constants", () => {
    expect(
      enrichGridUsdVirtualAccountPersistFields(
        {
          bank_name: null,
          bank_address: null,
          account_holder_name: null,
          bic: "CSRVUS33",
          currency: "USD",
        },
        "Easner Group, Inc",
      ),
    ).toEqual({
      bank_name: GRID_USD_SPONSOR_BANK.bankName,
      bank_address: GRID_USD_SPONSOR_BANK.bankAddress,
      account_holder_name: "Easner Group, Inc",
      bic: GRID_USD_SPONSOR_BANK.bic,
    })
  })

  it("preserves existing bic when already set on persist", () => {
    expect(
      enrichGridUsdVirtualAccountPersistFields(
        {
          bank_name: null,
          bank_address: null,
          account_holder_name: null,
          bic: "EXISTINGBIC",
          currency: "USD",
        },
        "Easner Group, Inc",
      )?.bic,
    ).toBe("EXISTINGBIC")
  })

  it("returns null for non-USD currency", () => {
    expect(
      enrichGridUsdVirtualAccountPersistFields(
        {
          bank_name: null,
          bank_address: null,
          account_holder_name: null,
          bic: null,
          currency: "eur",
        },
        "Easner Group, Inc",
      ),
    ).toBeNull()
  })
})
