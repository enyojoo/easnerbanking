import { describe, expect, it } from "vitest"
import { resolveInboundTransactionListLabel } from "./transaction-list-label"

describe("resolveInboundTransactionListLabel", () => {
  it("title-cases API name and metadata fallbacks", () => {
    expect(
      resolveInboundTransactionListLabel({
        name: "JANE Q PUBLIC",
        source_type: "virtual_account",
        metadata: { source: { sender_name: "JANE Q PUBLIC" } },
      }),
    ).toBe("Jane Q Public")
  })

  it("shows FiatDeposit sender on list, not narration or VA holder", () => {
    expect(
      resolveInboundTransactionListLabel({
        name: "Bank Deposit",
        metadata: {
          noah_fiat_deposit_sender_name: "Samuel Odiba",
          deposit_narration: "Sent from Grey",
          reference: "ACH Credit 026073154040278 Samuel Odiba Sent from Sent from Grey",
        },
        payload: {
          Direction: "In",
          Network: "OffNetwork",
          FiatPayment: { Amount: "12", FiatCurrency: "USD" },
          FiatPaymentMethod: {
            AccountHolderDetails: {
              Name: { FirstName: "JANE", MiddleName: "QUINN", LastName: "PUBLIC" },
            },
          },
        },
      }),
    ).toBe("Samuel Odiba")
  })
})
