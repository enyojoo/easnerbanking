import { describe, expect, it } from "vitest"
import { filterSupersededPendingGlobalPayoutRows } from "./filter-superseded-pending-payouts"

describe("filterSupersededPendingGlobalPayoutRows", () => {
  it("hides pending placeholder when yc send sibling exists", () => {
    const rows = filterSupersededPendingGlobalPayoutRows([
      {
        id: "pending-row",
        status: "pending",
        provider_transaction_id: "global_payout_pending:payout-1",
        metadata: { easner_payout_id: "payout-1", payout_type: "global_fiat" },
      },
      {
        id: "settled-row",
        status: "settled",
        provider_transaction_id: "yc-send-1",
        metadata: { easner_payout_id: "payout-1", payout_type: "global_fiat" },
      },
    ])
    expect(rows.map((r) => r.id)).toEqual(["settled-row"])
  })

  it("hides yc-send orphan when canonical sibling is preferred", () => {
    const rows = filterSupersededPendingGlobalPayoutRows(
      [
        {
          id: "canonical",
          status: "settled",
          provider_transaction_id: "global_payout_pending:payout-2",
          metadata: { easner_payout_id: "payout-2", payout_type: "global_fiat" },
        },
        {
          id: "orphan",
          status: "processing",
          provider_transaction_id: "yc-send-orphan",
          metadata: { easner_payout_id: "payout-2", payout_type: "global_fiat" },
        },
      ],
      { canonicalRowIds: new Set(["canonical"]) },
    )
    expect(rows.map((r) => r.id)).toEqual(["canonical"])
  })
})
