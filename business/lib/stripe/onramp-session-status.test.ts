import { describe, expect, it } from "vitest"
import {
  isStripeOnrampFulfilledStatus,
  mapStripeOnrampSessionToLedgerStatus,
} from "./onramp-session-status"

describe("onramp-session-status", () => {
  it("maps fulfillment_complete to settled", () => {
    expect(isStripeOnrampFulfilledStatus("fulfillment_complete")).toBe(true)
    expect(mapStripeOnrampSessionToLedgerStatus("fulfillment_complete")).toBe("settled")
  })

  it("maps in-flight session statuses to processing", () => {
    expect(mapStripeOnrampSessionToLedgerStatus("requires_payment")).toBe("processing")
    expect(mapStripeOnrampSessionToLedgerStatus("fulfillment_processing")).toBe("processing")
  })

  it("maps failed session statuses to failed", () => {
    expect(mapStripeOnrampSessionToLedgerStatus("failed")).toBe("failed")
    expect(mapStripeOnrampSessionToLedgerStatus("expired")).toBe("failed")
  })
})
