import { describe, expect, it } from "vitest"
import {
  isEasetagChainSettlementTransaction,
  isNoahGlobalPayoutOrchestrationInHiddenFromFeed,
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

  it("returns true when easetag_p2p_chain_mirror is true", () => {
    expect(isTurnkeyTransactionHiddenFromFeed({ easetag_p2p_chain_mirror: true })).toBe(true)
  })

  it("returns true when suppress_in_feed is true", () => {
    expect(isTurnkeyTransactionHiddenFromFeed({ suppress_in_feed: true })).toBe(true)
  })

  it("returns true when global_payout_settlement_leg is true", () => {
    expect(isTurnkeyTransactionHiddenFromFeed({ global_payout_settlement_leg: true })).toBe(true)
  })

  it("returns true when global_payout_orchestration_in_leg is true", () => {
    expect(isTurnkeyTransactionHiddenFromFeed({ global_payout_orchestration_in_leg: true })).toBe(true)
  })

  it("returns true when noah_orchestration_settlement_in_leg is true", () => {
    expect(isTurnkeyTransactionHiddenFromFeed({ noah_orchestration_settlement_in_leg: true })).toBe(true)
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

describe("isNoahGlobalPayoutOrchestrationInHiddenFromFeed", () => {
  const settlementHashes = new Set(["sig-global-payout"])

  it("hides Noah IN when signature matches Turnkey global payout settlement", () => {
    expect(
      isNoahGlobalPayoutOrchestrationInHiddenFromFeed(
        {
          provider: "noah",
          direction: "in",
          tx_hash: "sig-global-payout",
          payload: {
            Direction: "In",
            Network: "Solana",
            CryptoCurrency: "USDC",
          },
          metadata: { source: "webhook_transaction" },
        },
        settlementHashes,
      ),
    ).toBe(true)
  })

  it("shows organic Noah stablecoin deposit without matching settlement hash", () => {
    expect(
      isNoahGlobalPayoutOrchestrationInHiddenFromFeed(
        {
          provider: "noah",
          direction: "in",
          tx_hash: "organic-deposit",
          payload: {
            Direction: "In",
            Network: "Solana",
            CryptoCurrency: "USDC",
          },
          metadata: { source: "webhook_transaction" },
        },
        settlementHashes,
      ),
    ).toBe(false)
  })

  it("hides when metadata already tagged", () => {
    expect(
      isNoahGlobalPayoutOrchestrationInHiddenFromFeed(
        {
          provider: "noah",
          direction: "in",
          metadata: { global_payout_orchestration_in_leg: true },
        },
        new Set(),
      ),
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

  it("shows helius_webhook even when hash matches Noah set", () => {
    expect(
      isTurnkeyNoahBankOnrampChainMirror(
        {
          provider: "turnkey",
          direction: "in",
          tx_hash: "abc",
          metadata: { source: "helius_webhook" },
        },
        new Set(["abc"]),
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
