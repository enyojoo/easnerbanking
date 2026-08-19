import { describe, expect, it } from "vitest"
import {
  gridWebhookEventId,
  gridWebhookEventType,
  gridWebhookQuoteId,
  gridWebhookTransactionId,
} from "@/lib/grid/webhook-event-id"

describe("gridWebhookEventId", () => {
  it("uses top-level webhook id when present", () => {
    const id = gridWebhookEventId({
      id: "WebhookEvent:abc",
      eventType: "OUTGOING_PAYMENT.COMPLETED",
      data: { id: "Transaction:tx1", quoteId: "Quote:q1" },
    })
    expect(id).toBe("grid:OUTGOING_PAYMENT.COMPLETED:WebhookEvent:abc")
  })

  it("falls back to transaction id and status", () => {
    const id = gridWebhookEventId({
      eventType: "OUTGOING_PAYMENT.PROCESSING",
      createdAt: "2026-07-24T12:00:00Z",
      data: {
        id: "Transaction:019542f5-b3e7-1d02-0000-000000000001",
        quoteId: "Quote:019542f5-b3e7-1d02-0000-000000000002",
        status: "PROCESSING",
      },
    })
    expect(id).toContain("Transaction:019542f5-b3e7-1d02-0000-000000000001")
    expect(id).toContain("PROCESSING")
  })
})

describe("gridWebhookTransactionId", () => {
  it("prefers data.id when it is a Transaction resource", () => {
    expect(
      gridWebhookTransactionId({
        id: "Transaction:tx1",
        transactionId: "legacy-tx",
      }),
    ).toBe("Transaction:tx1")
  })

  it("uses transactionId when id is not a transaction", () => {
    expect(gridWebhookTransactionId({ id: "Quote:q1", transactionId: "Transaction:tx2" })).toBe(
      "Transaction:tx2",
    )
  })
})

describe("gridWebhookQuoteId", () => {
  it("reads quoteId from data", () => {
    expect(gridWebhookQuoteId({ quoteId: "Quote:abc" })).toBe("Quote:abc")
  })
})

describe("gridWebhookCustomerId", () => {
  it("reads Customer id from data.id", async () => {
    const { gridWebhookCustomerId } = await import("@/lib/grid/webhook-event-id")
    expect(
      gridWebhookCustomerId({
        id: "Customer:019ff8a6-443d-938e-0000-f6f502845e5b",
        platformCustomerId: "eb_4769329da17149cf86477e9b8a0128d3",
      }),
    ).toBe("Customer:019ff8a6-443d-938e-0000-f6f502845e5b")
  })

  it("reads Customer id from verification payloads", async () => {
    const { gridWebhookCustomerId } = await import("@/lib/grid/webhook-event-id")
    expect(
      gridWebhookCustomerId({
        id: "Verification:01a00918-1060-4d4a-0000-a20d667fa487",
        customerId: "Customer:01a008db-9fbc-938e-0000-a3e2e6585384",
        verificationStatus: "RESOLVE_ERRORS",
      }),
    ).toBe("Customer:01a008db-9fbc-938e-0000-a3e2e6585384")
  })
})

describe("gridWebhookDestinationAccountId", () => {
  it("reads destination.accountId", async () => {
    const { gridWebhookDestinationAccountId } = await import("@/lib/grid/webhook-event-id")
    expect(
      gridWebhookDestinationAccountId({
        destination: { accountId: "InternalAccount:usd-1" },
      }),
    ).toBe("InternalAccount:usd-1")
  })
})

describe("gridWebhookEventType", () => {
  it("reads eventType or type", () => {
    expect(gridWebhookEventType({ eventType: "INCOMING_PAYMENT.COMPLETED" })).toBe(
      "INCOMING_PAYMENT.COMPLETED",
    )
    expect(gridWebhookEventType({ type: "OUTGOING_PAYMENT.FAILED" })).toBe("OUTGOING_PAYMENT.FAILED")
  })
})
