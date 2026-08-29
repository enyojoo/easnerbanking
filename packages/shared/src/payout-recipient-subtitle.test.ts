import { describe, expect, it } from "vitest"
import {
  formatPayoutRecipientSubtitle,
  getPayoutRecipientSubtitleParts,
  resolveRecipientPayoutRail,
} from "./payout-recipient-subtitle"
import { resolveEffectivePayoutMin } from "./payout-business-limits"
import { validatePayoutAmountAgainstLimits } from "./payout-form-schema"

describe("getPayoutRecipientSubtitleParts", () => {
  it("formats bank as bank lead and account number", () => {
    const parts = getPayoutRecipientSubtitleParts({
      bankName: "GTBank Plc",
      fullAccountNumber: "0123456789",
    })
    expect(parts.left).toBe("GTBank")
    expect(parts.right).toBe("0123 4567 89")
  })

  it("formats mobile money as provider and phone", () => {
    const parts = getPayoutRecipientSubtitleParts({
      bankName: "Mobile Money (MTN|CC:NG)",
      mobileProvider: "MTN",
      phone: "+2348012345678",
    })
    expect(parts.left).toBe("MTN")
    expect(parts.right).toBe("+2348012345678")
  })

  it("keeps MTN MoMo label in subtitle", () => {
    const parts = getPayoutRecipientSubtitleParts({
      mobileProvider: "MTN MoMo",
      phone: "+233201234567",
    })
    expect(parts.left).toBe("MTN MoMo")
  })

  it("shows mobile phone as stored without adding a + prefix", () => {
    const parts = getPayoutRecipientSubtitleParts({
      mobileProvider: "MTN MoMo",
      phone: "039902",
    })
    expect(parts.right).toBe("039902")
  })

  it("preserves + when user entered international format", () => {
    const parts = getPayoutRecipientSubtitleParts({
      mobileProvider: "MTN MoMo",
      phone: "+233241234567",
    })
    expect(parts.right).toBe("+233241234567")
  })

  it("formats wallet as network and truncated address", () => {
    const parts = getPayoutRecipientSubtitleParts({
      bankName: "Wallet (USDC/Ethereum)",
      walletNetwork: "Ethereum",
      fullAccountNumber: "0x1234567890abcdef1234567890abcdef12345678",
    })
    expect(parts.left).toBe("Ethereum")
    expect(parts.right).toContain("...")
  })

  it("truncates EUR IBAN like a wallet address", () => {
    const parts = getPayoutRecipientSubtitleParts({
      bankName: "Allied Irish Banks",
      iban: "IE29AIBK93115212345678",
    })
    expect(parts.right).toBe("IE29AI...345678")
  })

  it("truncates a long IBAN stored in the account number field", () => {
    const parts = getPayoutRecipientSubtitleParts({
      bankName: "Central Bank",
      fullAccountNumber: "22828828828282882822",
    })
    expect(parts.right).toBe("228288...882822")
  })
})

describe("formatPayoutRecipientSubtitle", () => {
  it("joins left and right with bullet", () => {
    expect(
      formatPayoutRecipientSubtitle({
        bankName: "Chase Bank",
        fullAccountNumber: "123456789",
      }),
    ).toBe("Chase • 1234 5678 9")
  })
})

describe("resolveRecipientPayoutRail", () => {
  it("uses mobile_money when mobile_provider is set without Mobile Money bank label", () => {
    expect(
      resolveRecipientPayoutRail({
        bank_name: "MTN MoMo",
        mobile_provider: "MTN MoMo",
      }),
    ).toBe("mobile_money")
  })

  it("uses bank_transfer for plain GHS bank rows", () => {
    expect(
      resolveRecipientPayoutRail({
        bank_name: "GTBank Plc",
      }),
    ).toBe("bank_transfer")
  })
})

describe("Ghana mobile money minimum", () => {
  it("requires 40 GHS receive for mobile money, not the 10 GHS bank floor", () => {
    expect(
      resolveEffectivePayoutMin({
        hints: { limits: { min: "10" } },
        currencyCode: "GHS",
        rail: "mobile_money",
      }),
    ).toBe(40)

    const limitCheck = validatePayoutAmountAgainstLimits({
      amount: 10,
      hints: { limits: { min: "10" } },
      currencyCode: "GHS",
      rail: "mobile_money",
    })
    expect(limitCheck.ok).toBe(false)
    if (!limitCheck.ok) {
      expect(limitCheck.message).toContain("40")
    }
  })
})
