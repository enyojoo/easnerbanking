import { describe, expect, it } from "vitest"
import { computeEasnerRevenueFeeWalletSweepAmount } from "./easner-revenue-sweep"

describe("computeEasnerRevenueFeeWalletSweepAmount", () => {
  it("sums margin + processing fee (YC balance payout shape)", () => {
    const sweep = computeEasnerRevenueFeeWalletSweepAmount({
      marginAmount: 0.007283,
      processingFee: 0.014566,
      totalDebited: 1.478481,
      cryptoAuthorizedAmount: 1.456632,
    })
    expect(sweep).toBeCloseTo(0.021849, 6)
  })

  it("uses ledgerSurplus when quoted surplus is lower (Noah payout after floor-only send)", () => {
    const sweep = computeEasnerRevenueFeeWalletSweepAmount({
      marginAmount: 0.056124,
      processingFee: 0.037435,
      ledgerSurplus: 0.093559,
    })
    expect(sweep).toBeCloseTo(0.093559, 6)
  })

  it("uses omnibusIn − usdCredit for YC fund balance pay-in", () => {
    const sweep = computeEasnerRevenueFeeWalletSweepAmount({
      marginAmount: 0.5,
      processingFee: 1,
      ledgerSurplus: 65.5 - 64,
    })
    expect(sweep).toBe(1.5)
  })

  it("uses omnibusIn − leg2Crypto for YC cross-border", () => {
    const sweep = computeEasnerRevenueFeeWalletSweepAmount({
      marginAmount: 0.05,
      processingFee: 0.03,
      ledgerSurplus: 0.08,
    })
    expect(sweep).toBeCloseTo(0.08, 6)
  })

  it("prefers ledgerSurplus when it exceeds quoted margin + fee", () => {
    const sweep = computeEasnerRevenueFeeWalletSweepAmount({
      marginAmount: 0.005,
      processingFee: 0.01,
      ledgerSurplus: 1.5,
    })
    expect(sweep).toBe(1.5)
  })
})
