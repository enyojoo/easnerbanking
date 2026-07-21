import { describe, expect, it } from "vitest"
import {
  isNoahGlobalPayoutLedgerMeta,
  isYcBalancePayoutLedgerMeta,
} from "./payout-fee-ledger-routing"

describe("payout fee capture ledger routing", () => {
  it("detects YC balance payout metadata", () => {
    expect(isYcBalancePayoutLedgerMeta({ yc_mode: "balance_payout" })).toBe(true)
    expect(
      isYcBalancePayoutLedgerMeta({
        payout_provider: "yellowcard",
        payout_type: "global_fiat",
      }),
    ).toBe(true)
  })

  it("excludes YC from Noah global payout reconcile path", () => {
    const ycMeta = {
      yc_mode: "balance_payout",
      payout_type: "global_fiat",
      execution_model: "turnkey_workflow",
    }
    expect(isYcBalancePayoutLedgerMeta(ycMeta)).toBe(true)
    expect(isNoahGlobalPayoutLedgerMeta(ycMeta)).toBe(false)
  })

  it("keeps Noah global fiat on Noah reconcile path", () => {
    expect(
      isNoahGlobalPayoutLedgerMeta({
        payout_type: "global_fiat",
        execution_model: "turnkey_workflow",
        payout_provider: "noah",
      }),
    ).toBe(true)
  })
})
