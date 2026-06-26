import { describe, expect, it, vi, beforeEach } from "vitest"

vi.mock("@/lib/terminal/recipient-payout-country", () => ({
  resolveRecipientPayoutCountry: (row: { country_code?: string | null; currency: string }) =>
    String(row.country_code || (row.currency === "IDR" ? "ID" : "")).toUpperCase(),
}))

vi.mock("@/lib/noah/form-schema-hints", () => ({
  mobileProviderPrepareSubstrings: vi.fn(),
}))

vi.mock("@/lib/noah/payout-prepare", () => ({
  findBankSellChannelId: vi.fn(),
  prepareSellTransaction: vi.fn(),
  fetchSellChannelItems: vi.fn(),
  findIdentifierSellChannel: vi.fn(),
  buildBankLocalSellForm: vi.fn(),
  buildCaBankLocalSellForm: vi.fn(),
  buildEurSepaSellForm: vi.fn(),
  buildGbBankLocalSellForm: vi.fn(),
  buildIdBankLocalSellForm: vi.fn(),
  buildIdentifierSellForm: vi.fn(),
  buildUsBankSellForm: vi.fn(),
  isNoahUsAchChannel: vi.fn(),
  normalizeBankAccountNumber: (v: string) => v.replace(/\D/g, ""),
}))

import {
  buildIdBankLocalSellForm,
  findBankSellChannelId,
  prepareSellTransaction,
} from "@/lib/noah/payout-prepare"
import { prepareSellFromRecipientRow } from "@/lib/terminal/recipient-sell-prepare"

describe("prepareSellFromRecipientRow IDR", () => {
  beforeEach(() => {
    vi.mocked(findBankSellChannelId).mockReset()
    vi.mocked(prepareSellTransaction).mockReset()
    vi.mocked(buildIdBankLocalSellForm).mockReset()
  })

  const baseRow = {
    country_code: "ID",
    full_name: "Jane Doe",
    account_number: "1234567890",
    bank_name: "Bank Mandiri",
    swift_bic: "BMRIIDJA",
    phone_number: "+6281234567890",
    currency: "IDR",
  }

  it("throws when payment purpose is missing", async () => {
    await expect(
      prepareSellFromRecipientRow({
        row: baseRow,
        fiatAmount: 100000,
        cryptoCurrency: "USDC",
        noahCustomerId: "cust-1",
      }),
    ).rejects.toThrow("Payment purpose is required for Indonesian bank payouts.")
  })

  it("throws when SWIFT/BIC is missing", async () => {
    await expect(
      prepareSellFromRecipientRow({
        row: { ...baseRow, swift_bic: "" },
        fiatAmount: 100000,
        cryptoCurrency: "USDC",
        noahCustomerId: "cust-1",
        overrides: { paymentPurpose: "family support" },
      }),
    ).rejects.toThrow("SWIFT/BIC")
  })

  it("builds ID BankLocal form and prepares sell", async () => {
    vi.mocked(findBankSellChannelId).mockResolvedValue({
      channelId: "b6ec1c95-f036-523c-b092-eb5ce4255e4a",
      formSchema: {},
      paymentMethodType: "BankLocal",
    })
    vi.mocked(buildIdBankLocalSellForm).mockReturnValue({ PaymentPurpose: "family support" })
    vi.mocked(prepareSellTransaction).mockResolvedValue({ ok: true } as never)

    const result = await prepareSellFromRecipientRow({
      row: baseRow,
      fiatAmount: 100000,
      cryptoCurrency: "USDC",
      noahCustomerId: "cust-1",
      overrides: { paymentPurpose: "family support" },
    })

    expect(buildIdBankLocalSellForm).toHaveBeenCalledWith({
      accountNumber: "1234567890",
      bankName: "Bank Mandiri",
      swiftBic: "BMRIIDJA",
      fullName: "Jane Doe",
      phone: "+6281234567890",
      paymentPurpose: "family support",
    })
    expect(prepareSellTransaction).toHaveBeenCalledWith(
      expect.objectContaining({
        channelId: "b6ec1c95-f036-523c-b092-eb5ce4255e4a",
        fiatAmount: "100000.00",
      }),
    )
    expect(result.channelId).toBe("b6ec1c95-f036-523c-b092-eb5ce4255e4a")
  })
})
