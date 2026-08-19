import { describe, expect, it } from "vitest"
import { extractGridVaInboundSharedFields } from "./grid-va-inbound-fields"

describe("extractGridVaInboundSharedFields", () => {
  it("reads Grid ACH originator name and rail from source", () => {
    const fields = extractGridVaInboundSharedFields({
      id: "Transaction:01a0182e-5134-da6a-0000-c276a5845dae",
      source: {
        currency: "USD",
        sourceType: "REALTIME_FUNDING",
        paymentRail: "ACH",
        traceNumber: "101019648225263",
        bankIdentifier: "101019644",
        accountHolderName: "Bridge Building",
      },
      receivedAmount: { amount: 100, currency: { code: "USD", decimals: 2 } },
    })
    expect(fields.senderName).toBe("Bridge Building")
    expect(fields.sourcePaymentRail).toBe("ach")
    expect(fields.depositSchemeLabel).toBe("ACH")
  })
})
