import { describe, expect, it } from "vitest"
import {
  pickOfficeDetailFromCandidates,
  readUnsanitizedFailureReason,
  resolveOfficeCustomerHeroTitle,
} from "./office-transaction-detail"

describe("pickOfficeDetailFromCandidates", () => {
  it("returns the exact uuid row even when a more recently updated sibling exists", () => {
    const picked = pickOfficeDetailFromCandidates(
      [
        { id: "canonical", status: "settled", updated_at: "2026-09-17T12:00:00.000Z" },
        { id: "hidden-leg", status: "pending", updated_at: "2026-09-17T13:00:00.000Z" },
      ],
      "hidden-leg",
    )
    expect(picked?.id).toBe("hidden-leg")
  })

  it("falls back to the canonical settled row when lookup is an ETID", () => {
    const picked = pickOfficeDetailFromCandidates([
      { id: "pending", status: "pending", updated_at: "2026-09-17T13:00:00.000Z" },
      { id: "settled", status: "settled", updated_at: "2026-09-17T12:00:00.000Z" },
    ])
    expect(picked?.id).toBe("settled")
  })
})

describe("readUnsanitizedFailureReason", () => {
  it("returns the raw provider error instead of a sanitized customer string", () => {
    expect(
      readUnsanitizedFailureReason({
        failure_reason: "YC_CHANNEL_TIMEOUT: mm_collection expired",
      }),
    ).toBe("YC_CHANNEL_TIMEOUT: mm_collection expired")
  })
})

describe("resolveOfficeCustomerHeroTitle", () => {
  it("prefers the inbound receive title over a hardcoded Stablecoin Deposit hero", () => {
    expect(
      resolveOfficeCustomerHeroTitle({
        inboundDisplayTitle: "Payout fee",
        displayHeroTitle: "Stablecoin Deposit",
        transactionLabel: "Payout fee",
      }),
    ).toBe("Payout fee")
  })

  it("uses the org-treasury label when the mapped hero is still Stablecoin Deposit", () => {
    expect(
      resolveOfficeCustomerHeroTitle({
        inboundDisplayTitle: null,
        displayHeroTitle: "Stablecoin Deposit",
        transactionLabel: "Pay in fee",
      }),
    ).toBe("Pay in fee")
    expect(
      resolveOfficeCustomerHeroTitle({
        inboundDisplayTitle: null,
        displayHeroTitle: null,
        transactionLabel: "Payout refund",
      }),
    ).toBe("Payout refund")
  })
})
