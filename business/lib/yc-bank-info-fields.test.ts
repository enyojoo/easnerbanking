import { describe, expect, it } from "vitest"
import { ycBankInfoFields } from "./yc-bank-info-fields"

describe("ycBankInfoFields", () => {
  it("shows Bank Name once when name and bankName are mirrored", () => {
    const fields = ycBankInfoFields({
      accountName: "Samuel",
      accountNumber: "9916847619",
      name: "Nuvion MFB (Formerly Indulge MFB)",
      bankName: "Nuvion MFB (Formerly Indulge MFB)",
    })
    const bankNameRows = fields.filter((f) => f.label === "Bank Name")
    expect(bankNameRows).toHaveLength(1)
    expect(bankNameRows[0]?.value).toBe("Nuvion MFB (Formerly Indulge MFB)")
  })
})
