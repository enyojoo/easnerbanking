import { describe, expect, it } from "vitest"
import { isNoahLedgerTransactionPayload } from "@/lib/noah/map-transactions"

describe("isNoahLedgerTransactionPayload", () => {
  it("accepts Noah REST transaction payloads", () => {
    expect(
      isNoahLedgerTransactionPayload({
        ID: "48b9ebfb-39c6-5106-ada3-78597108ed59",
        Direction: "In",
        Status: "Settled",
        Created: "2026-07-13T11:29:53.222Z",
      }),
    ).toBe(true)
  })

  it("rejects Yellowcard webhook payloads that also carry lowercase id", () => {
    const ycPayload = {
      id: "c93c62bc-6dfd-50b1-89f8-db96b0f218a9",
      event: "RECEIVE.COMPLETE",
      sequenceId: "yc_fb_0f5e1504-dc60-48e4-b21e-e5d2216e2da7",
      status: "complete",
      settlementInfo: { cryptoAmount: 986.98910441, cryptoCurrency: "USDC" },
    }
    const row = { provider: "yellowcard", direction: "in" }

    expect(isNoahLedgerTransactionPayload(ycPayload, row)).toBe(false)
  })
})
