import { describe, expect, it } from "vitest"
import { getBankLogoPublicUrl, hasBankLogo, normalizeBankLogoKey } from "./bank-icons"

describe("bank-icons", () => {
  it("maps Yellow Card bank names to logo keys", () => {
    expect(normalizeBankLogoKey("Access Bank")).toBe("access")
    expect(normalizeBankLogoKey("GT Bank")).toBe("gtbank")
    expect(normalizeBankLogoKey("First National Bank (South Africa)")).toBe("fnb")
    expect(normalizeBankLogoKey("Standard Chartered Bank")).toBe("stanchart")
    expect(normalizeBankLogoKey("Standard Bank (South Africa)")).toBe("standardbank")
    expect(normalizeBankLogoKey("KENYA COMMERCIAL BANK LTD")).toBe("kcb")
    expect(normalizeBankLogoKey("CO-OPERATIVE BANK")).toBe("coop")
    expect(normalizeBankLogoKey("Titan-Paystack")).toBe("paystack")
    expect(normalizeBankLogoKey("Fairmoney Microfinance Bank Ltd")).toBe("fairmoney")
    expect(normalizeBankLogoKey("PremiumTrust Bank")).toBe("premiumtrust")
    expect(normalizeBankLogoKey("AFRICAN BANKING CORPORATION")).toBe("abc")
    expect(normalizeBankLogoKey("African Bank")).toBe("africanbank")
    expect(normalizeBankLogoKey("COMMERCIAL BANK OF AFRICA LTD")).toBe("ncba")
    expect(normalizeBankLogoKey("BANK OF AFRICA KENYA LTD")).toBe("boa")
    expect(normalizeBankLogoKey("INVESTMENTS AND MORTGAGES")).toBe("imbank")
    expect(normalizeBankLogoKey("K-REP BANK")).toBe("sidian")
    expect(normalizeBankLogoKey("TRANS-NATIONAL BANK")).toBe("sbm")
    expect(normalizeBankLogoKey("Societe Generale Ghana")).toBe("sg")
    expect(normalizeBankLogoKey("Sasfin Bank Limited")).toBe("sasfin")
  })

  it("returns public URLs for known banks", () => {
    expect(getBankLogoPublicUrl("Zenith Bank")).toBe("/banks/zenith.png")
    expect(hasBankLogo("Equity BANK")).toBe(true)
    expect(hasBankLogo("Unknown Credit Union")).toBe(false)
  })

  it("covers Yellow Card KE/GH/ZA names that have assets", () => {
    const names = [
      "INVESTMENTS AND MORTGAGES",
      "NATIONAL BANK OF KENYA",
      "JAMII BORA BANK LTD",
      "BANK OF BARODA",
      "BANK OF INDIA",
      "CENTRAL BANK OF KENYA",
      "G-Money",
      "GhanaPay",
      "Zeepay Ghana Limited",
      "National Investment Bank",
      "Finbond Mutual Bank",
      "Finbond EPE",
      "HBZ Bank",
      "HABIB BANK LTD",
      "HABIB BANK A.G.",
    ]
    for (const name of names) {
      expect(hasBankLogo(name), name).toBe(true)
    }
  })

})
