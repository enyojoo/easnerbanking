import { describe, expect, it } from "vitest"
import {
  filterRelatedOfficeLedgerLegs,
  officeRelatedLegMatchKeys,
  rowMatchesOfficeRelatedKeys,
} from "./office-related-ledger-legs"

describe("officeRelatedLegMatchKeys", () => {
  it("reads ETID from the column and payout id from metadata", () => {
    expect(
      officeRelatedLegMatchKeys({
        id: "row-1",
        easner_transaction_id: "ETID00000001",
        provider_transaction_id: "noah-abc",
        metadata: { easner_payout_id: "payout-9" },
      }),
    ).toEqual({ etid: "ETID00000001", payoutId: "payout-9" })
  })

  it("reads pending global payout ids from the provider transaction id", () => {
    expect(
      officeRelatedLegMatchKeys({
        id: "pending",
        easner_transaction_id: null,
        provider_transaction_id: "global_payout_pending:payout-1",
        metadata: { payout_type: "global_fiat" },
      }),
    ).toEqual({ etid: null, payoutId: "payout-1" })
  })
})

describe("rowMatchesOfficeRelatedKeys", () => {
  it("matches hidden Turnkey mirrors that share an ETID", () => {
    const keys = officeRelatedLegMatchKeys({
      id: "visible",
      easner_transaction_id: "ETID00000042",
      metadata: {},
    })
    expect(
      rowMatchesOfficeRelatedKeys(
        {
          id: "hidden",
          easner_transaction_id: "ETID00000042",
          metadata: { suppress_in_feed: true },
        },
        keys,
      ),
    ).toBe(true)
  })

  it("matches orchestration legs that share easner_payout_id", () => {
    const keys = { etid: null, payoutId: "payout-1" }
    expect(
      rowMatchesOfficeRelatedKeys(
        {
          id: "noah-in",
          metadata: { easner_payout_id: "payout-1" },
        },
        keys,
      ),
    ).toBe(true)
    expect(
      rowMatchesOfficeRelatedKeys(
        {
          id: "other",
          metadata: { easner_payout_id: "payout-2" },
        },
        keys,
      ),
    ).toBe(false)
  })
})

describe("filterRelatedOfficeLedgerLegs", () => {
  it("drops the canonical row and de-dupes siblings", () => {
    const related = filterRelatedOfficeLedgerLegs("canonical", [
      { id: "canonical" },
      { id: "hidden" },
      { id: "hidden" },
      { id: "other" },
    ])
    expect(related.map((row) => row.id)).toEqual(["hidden", "other"])
  })
})
