import { describe, expect, it } from "vitest"
import {
  getMobileMoneyProviderPublicUrl,
  hasMobileMoneyProviderIcon,
  normalizeMobileMoneyProviderKey,
} from "./mobile-money-icons"

describe("mobile-money-icons", () => {
  it("maps live Noah provider labels to asset keys", () => {
    expect(normalizeMobileMoneyProviderKey("MTN")).toBe("mtn")
    expect(normalizeMobileMoneyProviderKey("MTN MoMo")).toBe("mtn")
    expect(normalizeMobileMoneyProviderKey("M-PESA")).toBe("mpesa")
    expect(normalizeMobileMoneyProviderKey("AirtelTigo")).toBe("airteltigo")
    expect(normalizeMobileMoneyProviderKey("Airtel Money")).toBe("airtel")
    expect(normalizeMobileMoneyProviderKey("Vodafone")).toBe("vodafone")
  })

  it("returns public URLs for known providers", () => {
    expect(getMobileMoneyProviderPublicUrl("MTN")).toBe("/mobile-money/mtn.png")
    expect(hasMobileMoneyProviderIcon("Vodafone")).toBe(true)
    expect(hasMobileMoneyProviderIcon("Unknown")).toBe(false)
  })
})
