import { describe, expect, it, vi } from "vitest"
import {
  turnkeyInboundLedgerRowExists,
  turnkeyVisibleInboundLedgerRowExists,
} from "@/lib/turnkey/ledger-inbound-exists"

function mockAdmin(rows: Array<{ id: string; hidden_from_feed?: boolean | null }>) {
  const chain = {
    eq: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data: rows[0] ?? null }),
    limit: vi.fn().mockResolvedValue({ data: rows }),
  }
  return {
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue(chain),
    }),
  }
}

describe("ledger-inbound-exists", () => {
  it("turnkeyVisibleInboundLedgerRowExists ignores feed-hidden mirror rows", async () => {
    const admin = mockAdmin([
      { id: "hidden-1", hidden_from_feed: true },
      { id: "visible-1", hidden_from_feed: false },
    ])
    await expect(
      turnkeyVisibleInboundLedgerRowExists(admin as never, {
        signature: "sig-1",
        userId: "user-1",
        businessId: "biz-1",
      }),
    ).resolves.toBe(true)
  })

  it("turnkeyVisibleInboundLedgerRowExists is false when only hidden rows exist", async () => {
    const admin = mockAdmin([{ id: "hidden-1", hidden_from_feed: true }])
    await expect(
      turnkeyVisibleInboundLedgerRowExists(admin as never, {
        signature: "sig-1",
        userId: "user-1",
        businessId: "biz-1",
      }),
    ).resolves.toBe(false)
    await expect(
      turnkeyInboundLedgerRowExists(admin as never, {
        signature: "sig-1",
        userId: "user-1",
        businessId: "biz-1",
      }),
    ).resolves.toBe(true)
  })
})
