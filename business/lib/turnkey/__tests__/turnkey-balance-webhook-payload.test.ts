import { describe, expect, it } from "vitest"
import {
  isTurnkeyBalancesConfirmedWebhook,
  parseTurnkeyBalanceWebhookPayload,
  turnkeyWebhookInboxIdentity,
} from "@/lib/turnkey/turnkey-balance-webhook-payload"

/** Shape from https://docs.turnkey.com/concepts/balances#delivery-payload */
const BALANCES_CONFIRMED_DEPOSIT = {
  type: "balances:confirmed",
  msg: {
    operation: "deposit",
    txHash: "5abc123def456",
    address: "DepositAta1111111111111111111111111111111111",
    idempotencyKey: "idem-abc-123",
    asset: { symbol: "USDC", decimals: 6, amount: "9946074" },
    block: { timestamp: "2026-05-20T12:00:00.000Z" },
  },
}

const BALANCES_CONFIRMED_WITHDRAW = {
  type: "balances:confirmed",
  msg: {
    operation: "withdraw",
    txHash: "5withdrawhash",
    address: "Ata2222222222222222222222222222222222222",
    idempotencyKey: "idem-withdraw-1",
    asset: { symbol: "USDC", decimals: 6, amount: "1000000" },
    block: { timestamp: "2026-05-20T12:01:00.000Z" },
  },
}

describe("parseTurnkeyBalanceWebhookPayload", () => {
  it("parses balances:confirmed deposit with minor units", () => {
    const parsed = parseTurnkeyBalanceWebhookPayload(BALANCES_CONFIRMED_DEPOSIT)
    expect(parsed.kind).toBe("deposit")
    if (parsed.kind !== "deposit") return

    expect(parsed.data.eventId).toBe("idem-abc-123")
    expect(parsed.data.eventType).toBe("balances:confirmed")
    expect(parsed.data.txHash).toBe("5abc123def456")
    expect(parsed.data.address).toBe("DepositAta1111111111111111111111111111111111")
    expect(parsed.data.asset).toBe("USDC")
    expect(parsed.data.amount).toBeCloseTo(9.946074, 6)
    expect(parsed.data.amountMinor).toBe("9946074")
    expect(parsed.data.occurredAt).toBe("2026-05-20T12:00:00.000Z")
  })

  it("classifies withdraw without deposit ingest shape", () => {
    const parsed = parseTurnkeyBalanceWebhookPayload(BALANCES_CONFIRMED_WITHDRAW)
    expect(parsed.kind).toBe("withdraw")
    if (parsed.kind !== "withdraw") return
    expect(parsed.eventId).toBe("idem-withdraw-1")
    expect(parsed.eventType).toBe("balances:confirmed")
  })

  it("does not require top-level id for inbox identity", () => {
    const identity = turnkeyWebhookInboxIdentity(BALANCES_CONFIRMED_DEPOSIT)
    expect(identity).toEqual({
      eventId: "idem-abc-123",
      eventType: "balances:confirmed",
    })
  })

  it("detects balance webhooks without activity id", () => {
    expect(isTurnkeyBalancesConfirmedWebhook(BALANCES_CONFIRMED_DEPOSIT)).toBe(true)
    expect(isTurnkeyBalancesConfirmedWebhook({ type: "ACTIVITY_TYPE_CREATE_WALLET", id: "x" })).toBe(false)
  })
})
