import { describe, expect, it } from "vitest"
import {
  resolveTurnkeyWebhookInboxIdentity,
  validateTurnkeyWebhookOrganizationId,
  validateTurnkeyWebhookTimestamp,
  type TurnkeyWebhookHeaders,
} from "@/lib/turnkey/turnkey-webhook-delivery"

const BALANCE_PAYLOAD = {
  type: "balances:confirmed",
  msg: {
    operation: "deposit",
    txHash: "sig1",
    address: "Ata111",
    idempotencyKey: "idem-body",
    asset: { symbol: "USDC", decimals: 6, amount: "1000000" },
    block: { timestamp: "2026-05-20T12:00:00.000Z" },
  },
}

describe("resolveTurnkeyWebhookInboxIdentity", () => {
  it("prefers X-Turnkey-Event-Id over body", () => {
    const headers: TurnkeyWebhookHeaders = {
      organizationId: null,
      eventType: "balances:confirmed",
      eventId: "header-event-id",
      timestamp: null,
      webhookVersion: "2",
      signatureKeyId: null,
      signatureAlgorithm: null,
      signatureVersion: null,
      signature: null,
    }
    const id = resolveTurnkeyWebhookInboxIdentity(BALANCE_PAYLOAD, headers)
    expect(id?.eventId).toBe("header-event-id")
    expect(id?.eventType).toBe("balances:confirmed")
  })

  it("falls back to body idempotency key", () => {
    const headers: TurnkeyWebhookHeaders = {
      organizationId: null,
      eventType: null,
      eventId: null,
      timestamp: null,
      webhookVersion: null,
      signatureKeyId: null,
      signatureAlgorithm: null,
      signatureVersion: null,
      signature: null,
    }
    const id = resolveTurnkeyWebhookInboxIdentity(BALANCE_PAYLOAD, headers)
    expect(id?.eventId).toBe("idem-body")
  })
})

describe("validateTurnkeyWebhookOrganizationId", () => {
  it("returns mismatch when org differs", () => {
    const prev = process.env.TURNKEY_ORGANIZATION_ID
    process.env.TURNKEY_ORGANIZATION_ID = "org-expected"
    expect(validateTurnkeyWebhookOrganizationId("org-other")).toBe("organization_mismatch")
    process.env.TURNKEY_ORGANIZATION_ID = prev
  })

  it("allows missing header", () => {
    expect(validateTurnkeyWebhookOrganizationId(null)).toBeNull()
  })
})

describe("validateTurnkeyWebhookTimestamp", () => {
  it("rejects stale timestamp", () => {
    const old = new Date(Date.now() - 10 * 60 * 1000).toISOString()
    expect(validateTurnkeyWebhookTimestamp(old)).toBe("timestamp_out_of_range")
  })

  it("accepts recent timestamp", () => {
    const recent = new Date().toISOString()
    expect(validateTurnkeyWebhookTimestamp(recent)).toBeNull()
  })
})
