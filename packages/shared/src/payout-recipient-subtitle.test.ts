import { describe, expect, it } from "vitest"
import {
  formatPayoutRecipientSubtitle,
  getPayoutRecipientSubtitleParts,
} from "./payout-recipient-subtitle"

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

  it("keeps disambiguated MTN country labels in subtitle", () => {
    const parts = getPayoutRecipientSubtitleParts({
      mobileProvider: "MTN Ghana",
      phone: "+233201234567",
    })
    expect(parts.left).toBe("MTN Ghana")
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
