import { describe, expect, it, vi } from "vitest"
import { mergeProviderBindingsIntoMetadata } from "@easner/shared"
import { mapRecipientToYcSend } from "./map-recipient-to-yc-send"

vi.mock("@/lib/yellowcard/networks", () => ({
  listYellowcardNetworks: vi.fn(async () => [
    { id: "net-kuda", name: "Kuda Microfinance Bank", code: "Kuda Microfinance Bank" },
    { id: "net-gtb", name: "GTBank", code: "GTBank" },
  ]),
}))

describe("mapRecipientToYcSend provider bindings", () => {
  it("uses yellowcard binding when display label was saved under Grid primary", async () => {
    const row = {
      country_code: "NG",
      currency: "NGN",
      full_name: "Jane Doe",
      account_number: "0123456789",
      bank_name: "Kuda",
      phone_number: null,
      mobile_provider: null,
      metadata: mergeProviderBindingsIntoMetadata({}, {
        grid: { bankName: "Kuda Microfinance Bank" },
        yellowcard: { bankName: "Kuda Microfinance Bank" },
      }),
    }

    const mapped = await mapRecipientToYcSend(row)
    const destination = mapped.destination as Record<string, unknown>
    expect(destination.accountBank).toBe("Kuda Microfinance Bank")
  })
})
