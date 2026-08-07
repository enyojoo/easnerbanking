import { describe, expect, it } from "vitest"
import {
  computeEasnerRevenueFeeWalletSweepAmount,
  computeWalletSendFeeWalletSweepAmount,
} from "./easner-revenue-sweep"

describe("computeWalletSendFeeWalletSweepAmount", () => {
  it("does not double-count direct Turnkey 1% fee aliased on both fields", () => {
    // ETID99011346 shape: $2 principal, 1% = $0.02 stored as margin_amount AND processing_fee
    expect(
      computeWalletSendFeeWalletSweepAmount({
        executionModel: "direct_turnkey",
        marginAmount: 0.02,
        processingFee: 0.02,
      }),
    ).toBe(0.02)
  })

  it("sums distinct LI.FI FX margin + processing fee legs", () => {
    expect(
      computeWalletSendFeeWalletSweepAmount({
        executionModel: "relay_bridge",
        marginAmount: 1.52,
        processingFee: 1,
      }),
    ).toBe(2.52)
  })
})

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
