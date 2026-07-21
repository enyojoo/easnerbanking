import { describe, expect, it } from "vitest"
import { pickCanonicalLedgerDetailRow } from "./pick-canonical-ledger-row"

describe("pickCanonicalLedgerDetailRow", () => {
  it("prefers yc_transfers linked row when duplicates share ETID", () => {
    const picked = pickCanonicalLedgerDetailRow(
      [
        {
          id: "orphan",
          status: "processing",
          provider_transaction_id: "yc-send-1",
          updated_at: "2026-07-21T03:49:50Z",
          metadata: { easner_payout_id: "payout-1" },
        },
        {
          id: "canonical",
          status: "settled",
          provider_transaction_id: "global_payout_pending:payout-1",
          updated_at: "2026-07-21T03:52:18Z",
          metadata: { easner_payout_id: "payout-1" },
        },
      ],
      { preferredRowId: "canonical" },
    )
    expect(picked?.id).toBe("canonical")
  })

  it("prefers settled non-pending ptid when no preferred id", () => {
    const picked = pickCanonicalLedgerDetailRow([
      {
        id: "orphan",
        status: "processing",
        provider_transaction_id: "yc-send-1",
        updated_at: "2026-07-21T03:49:50Z",
      },
      {
        id: "settled",
        status: "settled",
        provider_transaction_id: "global_payout_pending:payout-1",
        updated_at: "2026-07-21T03:52:18Z",
      },
    ])
    expect(picked?.id).toBe("settled")
  })
})
