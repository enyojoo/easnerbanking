import { describe, expect, it } from "vitest"
import { resolveLedgerUserFacingCreatedAt } from "./ledger-display-time"
import { mapLedgerRowToMobileListItem } from "./map-ledger-list-row"

describe("resolveLedgerUserFacingCreatedAt", () => {
  it("uses created_at only", () => {
    expect(
      resolveLedgerUserFacingCreatedAt({ createdAt: "2026-01-01T10:00:00.000Z" }),
    ).toBe("2026-01-01T10:00:00.000Z")
  })
})

describe("mapLedgerRowToMobileListItem created_at", () => {
  it("prefers created_at over occurred_at for list timestamps", () => {
    const item = mapLedgerRowToMobileListItem({
      id: "db-1",
      provider: "noah",
      provider_transaction_id: "tx-1",
      status: "settled",
      amount: 10,
      currency: "USD",
      direction: "out",
      metadata: {},
      created_at: "2026-01-01T10:00:00.000Z",
      occurred_at: "2026-01-02T18:00:00.000Z",
    })
    expect(item.created_at).toBe("2026-01-01T10:00:00.000Z")
    expect(item.noah_created_at).toBe("2026-01-01T10:00:00.000Z")
  })
})
