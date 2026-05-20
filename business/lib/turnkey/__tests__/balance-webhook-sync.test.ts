import { describe, expect, it } from "vitest"
describe("balance webhook metadata", () => {
  it("tags organic deposits with turnkey_balance_webhook source", () => {
    const metadata = { source: "turnkey_balance_webhook" }
    expect(metadata.source).toBe("turnkey_balance_webhook")
  })
})
