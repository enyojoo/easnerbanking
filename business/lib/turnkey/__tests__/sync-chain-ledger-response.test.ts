import { describe, expect, it } from "vitest"
import { shouldRefreshAfterChainLedgerSync } from "@/lib/turnkey/sync-chain-ledger-response"

describe("shouldRefreshAfterChainLedgerSync", () => {
  it("returns true when Noah reconcile credited", () => {
    expect(shouldRefreshAfterChainLedgerSync({ noahReconcile: { credited: 1 } })).toBe(true)
  })

  it("returns true when RPC backfill upserted rows", () => {
    expect(shouldRefreshAfterChainLedgerSync({ result: { upserts: 2 } })).toBe(true)
  })

  it("returns false on cooldown-only ATA sync", () => {
    expect(
      shouldRefreshAfterChainLedgerSync({
        skipped: true,
        balanceSync: { ok: true, USD: 10, EUR: 0 },
        noahReconcile: { attempted: 0, credited: 0 },
      }),
    ).toBe(false)
  })
})
