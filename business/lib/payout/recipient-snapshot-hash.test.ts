import { describe, expect, it } from "vitest"
import { hashRecipientSnapshot } from "./recipient-snapshot-hash"

const usRecipient = {
  full_name: "Jane Doe",
  account_number: "123456789",
  bank_name: "Chase",
  currency: "USD",
  country_code: "US",
}

describe("hashRecipientSnapshot", () => {
  it("changes when US transfer type changes from ACH to RTP", () => {
    const ach = hashRecipientSnapshot({ ...usRecipient, transfer_type: "ACH" })
    const rtp = hashRecipientSnapshot({ ...usRecipient, transfer_type: "RTP" })
    expect(ach).not.toBe(rtp)
  })
})
