import { describe, expect, it } from "vitest"
import { generateTransactionId } from "./transaction-id"

describe("generateTransactionId", () => {
  it("starts with ETID", () => {
    expect(generateTransactionId().startsWith("ETID")).toBe(true)
  })

  it("has total length of 12 characters", () => {
    expect(generateTransactionId()).toHaveLength(12)
  })

  it("has an 8-digit numeric suffix", () => {
    const suffix = generateTransactionId().slice(4)
    expect(/^\d{8}$/.test(suffix)).toBe(true)
  })
})
