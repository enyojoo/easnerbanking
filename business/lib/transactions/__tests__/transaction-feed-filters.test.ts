import { describe, expect, it } from "vitest"
import {
  isEasetagChainSettlementTransaction,
  isTurnkeyNoahBankOnrampChainMirror,
  isTurnkeyTransactionHiddenFromFeed,
} from "@/lib/transactions/transaction-feed-filters"
import { deterministicTransferGroupUuid } from "@/lib/ledger/easetag-transfer"

describe("isTurnkeyTransactionHiddenFromFeed", () => {
  it("returns false for null or empty metadata", () => {
    expect(isTurnkeyTransactionHiddenFromFeed(null)).toBe(false)
    expect(isTurnkeyTransactionHiddenFromFeed(undefined)).toBe(false)
    expect(isTurnkeyTransactionHiddenFromFeed({})).toBe(false)
  })

  it("returns true when easetag_settlement_leg is true", () => {
    expect(isTurnkeyTransactionHiddenFromFeed({ easetag_settlement_leg: true })).toBe(true)
  })

  it("returns true when suppress_in_feed is true", () => {
    expect(isTurnkeyTransactionHiddenFromFeed({ suppress_in_feed: true })).toBe(true)
  })

  it("returns true for Noah orchestration out payload without metadata flag", () => {
    expect(
      isTurnkeyTransactionHiddenFromFeed(null, {
        Direction: "Out",
        Network: "Solana",
        CryptoCurrency: "USDC",
        Orchestration: { RuleExecutionID: "abc" },
      }),
    ).toBe(true)
  })
})

describe("isTurnkeyNoahBankOnrampChainMirror", () => {
  const noahHashes = new Set(["sig-noah"])

  it("hides turnkey inbound when signature matches Noah bank onramp", () => {
    expect(
      isTurnkeyNoahBankOnrampChainMirror(
        {
          provider: "turnkey",
          direction: "in",
          tx_hash: "sig-noah",
          metadata: { source: "turnkey_onchain_backfill" },
        },
        noahHashes,
      ),
    ).toBe(true)
  })

  it("does not hide unrelated turnkey rows", () => {
    expect(
      isTurnkeyNoahBankOnrampChainMirror(
        { provider: "turnkey", direction: "in", tx_hash: "other-sig", metadata: {} },
        noahHashes,
      ),
    ).toBe(false)
  })

  it("shows turnkey_chain_sync even when hash matches Noah set", () => {
    expect(
      isTurnkeyNoahBankOnrampChainMirror(
        {
          provider: "turnkey",
          direction: "in",
          tx_hash: "sig-noah",
          metadata: { source: "turnkey_chain_sync" },
        },
        noahHashes,
      ),
    ).toBe(false)
  })
})

describe("isEasetagChainSettlementTransaction", () => {
  it("returns false for null or empty metadata", () => {
    expect(isEasetagChainSettlementTransaction(null)).toBe(false)
    expect(isEasetagChainSettlementTransaction({})).toBe(false)
  })

  it("returns true when easetag_settlement_leg is true or string true", () => {
    expect(isEasetagChainSettlementTransaction({ easetag_settlement_leg: true })).toBe(true)
    expect(isEasetagChainSettlementTransaction({ easetag_settlement_leg: "true" })).toBe(true)
  })

  it("returns false for suppress_in_feed without easetag_settlement_leg", () => {
    expect(isEasetagChainSettlementTransaction({ suppress_in_feed: true })).toBe(false)
  })
})

describe("deterministicTransferGroupUuid", () => {
  it("is stable for the same idempotency key", () => {
    const k = "easetag:user1:user2:USD:10:alice"
    expect(deterministicTransferGroupUuid(k)).toBe(deterministicTransferGroupUuid(k))
  })

  it("produces a valid UUID shape", () => {
    const id = deterministicTransferGroupUuid("x")
    expect(id).toMatch(/^[0-9a-f-]{36}$/i)
  })
})
