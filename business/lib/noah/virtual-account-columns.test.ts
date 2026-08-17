import { describe, expect, it } from "vitest"
import { pickPreferredVirtualAccountRow } from "./virtual-account-columns"

describe("pickPreferredVirtualAccountRow", () => {
  it("prefers Grid provider rows for business USD accounts", () => {
    const row = pickPreferredVirtualAccountRow(
      [
        {
          provider_virtual_account_id: "Bank/Ach/USD/043087080/433963264657/ebiz_test",
          currency: "USD",
          account_number: "433963264657",
          routing_number: "043087080",
          iban: null,
          bic: null,
          sort_code: null,
          bank_name: "SSB Bank",
          bank_address: null,
          account_holder_name: null,
          provider: "noah",
        },
        {
          provider_virtual_account_id: "InternalAccount:abc:usd:US_ACCOUNT",
          currency: "usd",
          account_number: "123456789",
          routing_number: "021000021",
          iban: null,
          bic: null,
          sort_code: null,
          bank_name: "Grid Bank",
          bank_address: null,
          account_holder_name: null,
          provider: "grid",
        },
      ],
      "usd",
      { preferProvider: "grid" },
    )

    expect(row?.provider).toBe("grid")
    expect(row?.account_number).toBe("123456789")
  })
})
