import { describe, expect, it } from "vitest"
import { buildGridExternalAccountPayload, extractGridFundingSolanaAddress } from "./external-account"

describe("extractGridFundingSolanaAddress", () => {
  const sol = "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU"

  it("reads solanaAddress from paymentInstructions", () => {
    expect(
      extractGridFundingSolanaAddress({
        paymentInstructions: { accountOrWalletInfo: { solanaAddress: sol } },
      }),
    ).toBe(sol)
  })

  it("reads depositAddress from fundingPaymentInstructions", () => {
    expect(
      extractGridFundingSolanaAddress({
        fundingPaymentInstructions: { accountOrWalletInfo: { depositAddress: sol } },
      }),
    ).toBe(sol)
  })

  it("rejects short non-address strings", () => {
    expect(
      extractGridFundingSolanaAddress({
        paymentInstructions: { accountOrWalletInfo: { accountNumber: "12345" } },
      }),
    ).toBeNull()
  })

  it("reads SOLANA_WALLET address from Grid's paymentInstructions array", () => {
    expect(
      extractGridFundingSolanaAddress({
        paymentInstructions: [
          {
            accountOrWalletInfo: {
              accountType: "SOLANA_WALLET",
              address: sol,
              assetType: "USDC",
            },
          },
        ],
      }),
    ).toBe(sol)
  })

  it("prefers SOLANA_WALLET when EVM addresses come first", () => {
    expect(
      extractGridFundingSolanaAddress({
        fundingPaymentInstructions: [
          {
            accountOrWalletInfo: {
              accountType: "ETHEREUM_WALLET",
              address: "0x4665242F0be442969aBf56d449Ec2a8D2EF11830",
              assetType: "USDC",
            },
          },
          {
            accountOrWalletInfo: {
              accountType: "SOLANA_WALLET",
              address: sol,
              assetType: "USDC",
            },
          },
        ],
      }),
    ).toBe(sol)
  })
})

describe("buildGridExternalAccountPayload EUR", () => {
  it("maps IBAN onto EUR_ACCOUNT without accountNumber", () => {
    const payload = buildGridExternalAccountPayload({
      customerId: "Customer:abc",
      rail: "bank_transfer",
      recipient: {
        currency: "EUR",
        country_code: "DE",
        full_name: "Maria Garcia",
        account_number: "",
        iban: "DE89370400440532013000",
        swift_bic: "COBADEFFXXX",
        bank_name: "Commerzbank",
      },
    })
    expect(payload.accountInfo.accountType).toBe("EUR_ACCOUNT")
    expect(payload.accountInfo.iban).toBe("DE89370400440532013000")
    expect(payload.accountInfo.swiftCode).toBe("COBADEFFXXX")
    expect(payload.accountInfo.accountNumber).toBeUndefined()
  })
})

describe("buildGridExternalAccountPayload CAD", () => {
  it("maps routing/sort into bankCode and branchCode", () => {
    const payload = buildGridExternalAccountPayload({
      customerId: "Customer:abc",
      rail: "bank_transfer",
      recipient: {
        currency: "CAD",
        country_code: "CA",
        full_name: "Jane Doe",
        account_number: "1234567",
        bank_name: "Royal Bank of Canada",
        routing_number: "000300012",
        sort_code: "00012",
        metadata: {},
      },
    })
    expect(payload.accountInfo.accountType).toBe("CAD_ACCOUNT")
    expect(payload.accountInfo.bankCode).toBe("003")
    expect(payload.accountInfo.branchCode).toBe("00012")
    expect(payload.accountInfo.accountNumber).toBe("1234567")
  })
})

describe("buildGridExternalAccountPayload USD", () => {
  it("maps US ACH routing number onto USD_ACCOUNT", () => {
    const payload = buildGridExternalAccountPayload({
      customerId: "Customer:abc",
      rail: "bank_transfer",
      recipient: {
        currency: "USD",
        country_code: "US",
        full_name: "Jane Doe",
        account_number: "123456789",
        bank_name: "Chase",
        routing_number: "021000021",
        checking_or_savings: "checking",
      },
    })
    expect(payload.accountInfo.accountType).toBe("USD_ACCOUNT")
    expect(payload.accountInfo.accountNumber).toBe("123456789")
    expect(payload.accountInfo.routingNumber).toBe("021000021")
    expect(payload.accountInfo.bankAccountType).toBe("CHECKING")
  })

  it("omits bankAccountType when checking_or_savings is not stored", () => {
    const payload = buildGridExternalAccountPayload({
      customerId: "Customer:abc",
      rail: "bank_transfer",
      recipient: {
        currency: "USD",
        country_code: "US",
        full_name: "Jane Doe",
        account_number: "123456789",
        bank_name: "Chase",
        routing_number: "021000021",
      },
    })
    expect(payload.accountInfo.routingNumber).toBe("021000021")
    expect(payload.accountInfo.bankAccountType).toBeUndefined()
  })
})

describe("buildGridExternalAccountPayload BRL", () => {
  it("maps Pix key and Grid pixKeyType, including RANDOM", () => {
    const payload = buildGridExternalAccountPayload({
      customerId: "Customer:abc",
      rail: "bank_transfer",
      recipient: {
        currency: "BRL",
        country_code: "BR",
        full_name: "Joao Silva",
        account_number: "123e4567-e89b-12d3-a456-426614174000",
        bank_name: "Pix",
        metadata: { pix_key_type: "RANDOM_KEY", tax_id: "123.456.789-01" },
      },
    })
    expect(payload.accountInfo.accountType).toBe("BRL_ACCOUNT")
    expect(payload.accountInfo.pixKey).toBe("123e4567-e89b-12d3-a456-426614174000")
    expect(payload.accountInfo.pixKeyType).toBe("RANDOM")
    expect(payload.accountInfo.accountNumber).toBeUndefined()
    expect(payload.accountInfo.bankName).toBeUndefined()
    expect(payload.accountInfo.taxId).toBe("12345678901")
  })

  it("requires a separate taxId for email Pix keys", () => {
    expect(() =>
      buildGridExternalAccountPayload({
        customerId: "Customer:abc",
        rail: "bank_transfer",
        recipient: {
          currency: "BRL",
          country_code: "BR",
          full_name: "Joao Silva",
          account_number: "joao@example.com",
          metadata: { pix_key_type: "EMAIL" },
        },
      }),
    ).toThrow(/tax ID/)
  })

  it("sets taxId from a CPF Pix key", () => {
    const payload = buildGridExternalAccountPayload({
      customerId: "Customer:abc",
      rail: "bank_transfer",
      recipient: {
        currency: "BRL",
        country_code: "BR",
        full_name: "Joao Silva",
        account_number: "123.456.789-01",
        bank_name: "Pix",
        metadata: { pix_key_type: "CPF" },
      },
    })
    expect(payload.accountInfo.pixKeyType).toBe("CPF")
    expect(payload.accountInfo.pixKey).toBe("12345678901")
    expect(payload.accountInfo.taxId).toBe("12345678901")
    expect(payload.accountInfo.bankName).toBeUndefined()
  })
})

describe("buildGridExternalAccountPayload CNY", () => {
  it("uses BUSINESS beneficiary and BANK_TRANSFER for China bank recipients", () => {
    const payload = buildGridExternalAccountPayload({
      customerId: "Customer:abc",
      rail: "bank_transfer",
      recipient: {
        currency: "CNY",
        country_code: "CN",
        full_name: "Shanghai Trading Co Ltd",
        account_number: "6222021234567890123",
        bank_name: "Bank Of China",
        address_line1: "100 Century Avenue",
        city: "Shanghai",
        postal_code: "200120",
        metadata: { registration_number: "91310000MA1K3XXXXX" },
      },
    })
    expect(payload.accountInfo.accountType).toBe("CNY_ACCOUNT")
    expect(payload.accountInfo.paymentRails).toEqual(["BANK_TRANSFER"])
    expect(payload.accountInfo.bankName).toBe("Bank Of China")
    expect(payload.accountInfo.beneficiary).toMatchObject({
      beneficiaryType: "BUSINESS",
      legalName: "Shanghai Trading Co Ltd",
      registrationNumber: "91310000MA1K3XXXXX",
      address: {
        line1: "100 Century Avenue",
        city: "Shanghai",
        country: "CN",
        postalCode: "200120",
      },
    })
  })

  it("maps AliPay/WeChat via bankName on mobile money", () => {
    const payload = buildGridExternalAccountPayload({
      customerId: "Customer:abc",
      rail: "mobile_money",
      recipient: {
        currency: "CNY",
        country_code: "CN",
        full_name: "Li Wei",
        account_number: "",
        phone_number: "+8613812345678",
        mobile_provider: "WechatPay",
      },
      gridMomoCandidates: [{ value: "WechatPay", label: "WechatPay" }],
    })
    expect(payload.accountInfo.accountType).toBe("CNY_ACCOUNT")
    expect(payload.accountInfo.paymentRails).toEqual(["MOBILE_MONEY"])
    expect(payload.accountInfo.bankName).toBe("WechatPay")
    expect(payload.accountInfo.phoneNumber).toBeTruthy()
    expect(payload.accountInfo.provider).toBeUndefined()
    expect(payload.accountInfo.beneficiary).toMatchObject({
      beneficiaryType: "INDIVIDUAL",
      fullName: "Li Wei",
    })
  })
})
