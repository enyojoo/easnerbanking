import { describe, expect, it } from "vitest"
import { recipientIdFromLedgerMetadata } from "./ledger-recipient-id"

describe("recipientIdFromLedgerMetadata", () => {
  it("reads recipient_id", () => {
    expect(recipientIdFromLedgerMetadata({ recipient_id: "rec-1" })).toBe("rec-1")
  })

  it("reads destination_ref recipient:id", () => {
    expect(recipientIdFromLedgerMetadata({ destination_ref: "recipient:rec-2" })).toBe("rec-2")
  })

  it("prefers recipient_id over destination_ref", () => {
    expect(
      recipientIdFromLedgerMetadata({
        recipient_id: "rec-a",
        destination_ref: "recipient:rec-b",
      }),
    ).toBe("rec-a")
  })

  it("ignores payroll destination refs", () => {
    expect(recipientIdFromLedgerMetadata({ destination_ref: "payroll_method:pm-1" })).toBeNull()
  })

  it("returns null when unset", () => {
    expect(recipientIdFromLedgerMetadata({})).toBeNull()
    expect(recipientIdFromLedgerMetadata(null)).toBeNull()
  })
})
