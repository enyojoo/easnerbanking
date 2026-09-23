import { describe, expect, it } from "vitest"
import { signatureIsAfterFeeSubmit, stablecoinAmountMatches } from "./fee-wallet-chain-match"

describe("fee wallet chain match", () => {
  it("matches a USDC fee only at the exact atomic amount", () => {
    expect(stablecoinAmountMatches(BigInt(2_000_000), 6, 2)).toBe(true)
    expect(stablecoinAmountMatches(BigInt(2_000_001), 6, 2)).toBe(false)
    expect(stablecoinAmountMatches(BigInt(0), 6, 2)).toBe(false)
  })

  it("ignores fee-wallet credits from before the sweep was submitted", () => {
    const submittedAt = "2026-09-23T10:07:31.942Z"
    const submittedSec = Math.floor(Date.parse(submittedAt) / 1000)
    expect(signatureIsAfterFeeSubmit(submittedSec - 10, submittedAt)).toBe(true)
    expect(signatureIsAfterFeeSubmit(submittedSec - 180, submittedAt)).toBe(false)
    expect(signatureIsAfterFeeSubmit(null, submittedAt)).toBe(true)
  })
})