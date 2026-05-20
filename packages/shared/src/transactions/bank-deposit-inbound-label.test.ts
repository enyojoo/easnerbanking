import { describe, expect, it } from "vitest"
import {
  deriveBankDepositInboundDisplayLabel,
  deriveBankDepositNarrationLabel,
  parseSentFromNarrationLabel,
} from "./bank-deposit-inbound-label"

const ACH_REF =
  "ACH Credit 026073154040278 Samuel Odiba Sent from Sent from Grey"

describe("bank-deposit-inbound-label", () => {
  it("parses Sent from Grey from double-sent-from narration", () => {
    expect(parseSentFromNarrationLabel(ACH_REF)).toBe("Sent from Grey")
  })

  it("uses FiatDeposit sender for hero/list title", () => {
    expect(
      deriveBankDepositInboundDisplayLabel({
        fiatDepositSenderName: "Samuel Odiba",
      }),
    ).toBe("Samuel Odiba")
  })

  it("does not use narration as display label", () => {
    expect(
      deriveBankDepositInboundDisplayLabel({
        metadata: { reference: ACH_REF },
        fiatDepositSenderName: "Samuel Odiba",
      }),
    ).toBe("Samuel Odiba")
  })

  it("derives narration separately from ACH reference", () => {
    expect(
      deriveBankDepositNarrationLabel({
        paymentReference: ACH_REF,
      }),
    ).toBe("Sent from Grey")
  })
})
