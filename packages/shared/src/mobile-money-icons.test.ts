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
    expect(normalizeMobileMoneyProviderKey("TELECEL")).toBe("vodafone")
    expect(normalizeMobileMoneyProviderKey("Telecel Cash")).toBe("vodafone")
    expect(normalizeMobileMoneyProviderKey("AT")).toBe("airteltigo")
    expect(normalizeMobileMoneyProviderKey("Mobile Wallet (M-PESA)")).toBe("mpesa")
    expect(normalizeMobileMoneyProviderKey("M PESA")).toBe("mpesa")
    expect(normalizeMobileMoneyProviderKey("MTN_Rwanda")).toBe("mtn")
    expect(normalizeMobileMoneyProviderKey("Moov Money")).toBe("moov")
    expect(normalizeMobileMoneyProviderKey("Wave")).toBe("wave")
    expect(normalizeMobileMoneyProviderKey("TNM")).toBe("tnm")
    expect(normalizeMobileMoneyProviderKey("HALOPESA")).toBe("halopesa")
    expect(normalizeMobileMoneyProviderKey("TogoCell")).toBe("togocell")
    expect(normalizeMobileMoneyProviderKey("Free")).toBe("free")
  })

  it("does not reuse another brand's logo", () => {
    expect(normalizeMobileMoneyProviderKey("AZAMPESA")).toBeUndefined()
    expect(hasMobileMoneyProviderIcon("Unknown")).toBe(false)
  })

  it("returns public URLs for known providers", () => {
    expect(getMobileMoneyProviderPublicUrl("MTN")).toBe("/mobile-money/mtn.png")
    expect(getMobileMoneyProviderPublicUrl("Wave")).toBe("/mobile-money/wave.png")
    expect(hasMobileMoneyProviderIcon("Vodafone")).toBe(true)
    expect(hasMobileMoneyProviderIcon("TNM")).toBe(true)
    expect(hasMobileMoneyProviderIcon("Unknown")).toBe(false)
  })
})
